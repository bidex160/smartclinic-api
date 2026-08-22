import { ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { appConfig } from '../config/app.config';
import { EMAIL_PROVIDER, EmailProvider, EmailSendOutcome } from '../notifications/email/email-provider';
import { UserCredential } from '../users/entities/user-credential.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { AcceptProviderInvitationDto, AcceptedProviderInvitationResponseDto, AdminProviderInvitationSummaryDto, CreatedProviderInvitationResponseDto, ProviderInvitationDeliveryStatus, PublicProviderInvitationResponseDto } from './dto/provider-invitation.dto';
import { ProviderInvitation } from './entities/provider-invitation.entity';
import { Provider } from './entities/provider.entity';
import { ProviderInvitationStatus } from './enums/provider-invitation-status.enum';
import { CreateAdminProviderDto, AdminCreatedProviderResponseDto } from './dto/admin-provider-management.dto';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';

@Injectable()
export class ProviderInvitationsService {
  private readonly logger = new Logger(ProviderInvitationsService.name);
  constructor(@InjectRepository(ProviderInvitation) private readonly invitations: Repository<ProviderInvitation>, @InjectRepository(Provider) private readonly providers: Repository<Provider>, @InjectRepository(User) private readonly users: Repository<User>, @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>, @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider) {}

  async createProvider(dto: CreateAdminProviderDto, creatorId: string): Promise<AdminCreatedProviderResponseDto> {
    const email = dto.email.trim().toLowerCase(); const rawToken = randomBytes(32).toString('base64url'); const now = new Date();
    let result: { provider: Provider; invitation: ProviderInvitation };
    try { result = await this.invitations.manager.transaction(async (manager) => {
        const providerRepository = manager.getRepository(Provider); const invitationRepository = manager.getRepository(ProviderInvitation); const userRepository = manager.getRepository(User);
        if (await userRepository.exists({ where: { emailNormalized: email }, withDeleted: true })) throw new ConflictException('An account already exists for this email; use existing-user linking');
        if (await providerRepository.exists({ where: { email }, withDeleted: true })) throw new ConflictException('A provider already exists for this email');
        const provider = await providerRepository.save(providerRepository.create({ userId: null, displayName: dto.displayName.trim(), email, phone: dto.phone?.trim() || null, professionalReference: dto.professionalReference?.trim() || null, providerType: dto.providerType, countryCode: dto.countryCode.toUpperCase(), stateOrRegion: dto.stateOrRegion.trim(), city: dto.city.trim(), status: ProviderStatus.PENDING, onboardingStatus: ProviderOnboardingStatus.INVITED, submittedAt: null, reviewedAt: null, reviewedByUserId: null, reviewNote: null }));
        const invitation = await invitationRepository.save(invitationRepository.create({ providerId: provider.id, email, emailNormalized: email, tokenHash: this.hash(rawToken), status: ProviderInvitationStatus.PENDING, expiresAt: new Date(now.getTime() + this.config.providerInvitations.ttlSeconds * 1000), acceptedAt: null, revokedAt: null, createdByUserId: creatorId }));
        return { provider, invitation };
      });
    } catch (error) { if (error instanceof QueryFailedError) throw new ConflictException('A provider account or invitation already exists for this email'); throw error; }
    const invitation = await this.requireAdminInvitation(result.invitation.id);
    return { provider: this.createdProvider(result.provider), invitation: await this.deliver(invitation, rawToken) };
  }

  async create(providerId: string, email: string, creatorId: string): Promise<CreatedProviderInvitationResponseDto> {
    const normalized = email.trim().toLowerCase(); const rawToken = randomBytes(32).toString('base64url'); const now = new Date();
    const invitation = await this.invitations.manager.transaction(async (manager) => {
      const providerRepository = manager.getRepository(Provider); const invitationRepository = manager.getRepository(ProviderInvitation); const userRepository = manager.getRepository(User);
      const provider = await providerRepository.findOne({ where: { id: providerId }, withDeleted: true, lock: { mode: 'pessimistic_write' } });
      if (!provider || provider.deletedAt) throw new NotFoundException('Provider not found');
      if (provider.userId) throw new ConflictException('Provider is already linked to a user');
      if (await userRepository.exists({ where: { emailNormalized: normalized }, withDeleted: true })) throw new ConflictException('An account already exists for this email; use existing-user linking');
      const existing = await invitationRepository.findOne({ where: { providerId, emailNormalized: normalized, status: ProviderInvitationStatus.PENDING }, lock: { mode: 'pessimistic_write' } });
      if (existing && existing.expiresAt > now) throw new ConflictException('An active invitation already exists for this provider and email');
      if (existing) { existing.status = ProviderInvitationStatus.EXPIRED; await invitationRepository.save(existing); }
      return invitationRepository.save(invitationRepository.create({ providerId, email: normalized, emailNormalized: normalized, tokenHash: this.hash(rawToken), status: ProviderInvitationStatus.PENDING, expiresAt: new Date(now.getTime() + this.config.providerInvitations.ttlSeconds * 1000), acceptedAt: null, revokedAt: null, createdByUserId: creatorId }));
    });
    const hydrated = await this.requireAdminInvitation(invitation.id);
    if (hydrated.provider.onboardingStatus === ProviderOnboardingStatus.DRAFT) { hydrated.provider.onboardingStatus = ProviderOnboardingStatus.INVITED; await this.providers.save(hydrated.provider); }
    return this.deliver(hydrated, rawToken);
  }

  async list(providerId: string): Promise<AdminProviderInvitationSummaryDto[]> { await this.requireProvider(providerId); const rows = await this.invitations.find({ where: { providerId }, relations: { provider: true, createdBy: true }, order: { createdAt: 'DESC', id: 'DESC' } }); return rows.map((row) => this.adminSummary(row)); }

  async revoke(id: string): Promise<AdminProviderInvitationSummaryDto> {
    await this.invitations.manager.transaction(async (manager) => { const repository = manager.getRepository(ProviderInvitation); const invitation = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } }); if (!invitation) throw new NotFoundException('Provider invitation not found'); if (invitation.status !== ProviderInvitationStatus.PENDING) throw new ConflictException('Only pending invitations can be revoked'); if (invitation.expiresAt <= new Date()) { invitation.status = ProviderInvitationStatus.EXPIRED; await repository.save(invitation); throw new ConflictException('Invitation has expired'); } invitation.status = ProviderInvitationStatus.REVOKED; invitation.revokedAt = new Date(); await repository.save(invitation); });
    return this.adminSummary(await this.requireAdminInvitation(id));
  }

  async inspect(token: string): Promise<PublicProviderInvitationResponseDto> { const invitation = await this.findUsable(token); return { providerDisplayName: invitation.provider.displayName, invitedEmail: this.mask(invitation.email), expiresAt: invitation.expiresAt }; }

  async accept(token: string, dto: AcceptProviderInvitationDto): Promise<AcceptedProviderInvitationResponseDto> {
    await this.findUsable(token); const passwordHash = await bcrypt.hash(dto.password, 12); const tokenHash = this.hash(token); const now = new Date();
    try {
      const result = await this.invitations.manager.transaction(async (manager) => {
        const invitationRepository = manager.getRepository(ProviderInvitation); const providerRepository = manager.getRepository(Provider); const userRepository = manager.getRepository(User); const credentialRepository = manager.getRepository(UserCredential);
        const invitation = await invitationRepository.findOne({ where: { tokenHash }, lock: { mode: 'pessimistic_write' } });
        if (!invitation || invitation.status !== ProviderInvitationStatus.PENDING) this.invalid();
        if (invitation.expiresAt <= now) { invitation.status = ProviderInvitationStatus.EXPIRED; await invitationRepository.save(invitation); this.expired(); }
        const provider = await providerRepository.findOne({ where: { id: invitation.providerId }, withDeleted: true, lock: { mode: 'pessimistic_write' } });
        if (!provider || provider.deletedAt || provider.userId) this.invalid();
        if (await userRepository.exists({ where: { emailNormalized: invitation.emailNormalized }, withDeleted: true })) throw new ConflictException('An account already exists for this email; sign in and ask operations to link it');
        const user = await userRepository.save(userRepository.create({ email: invitation.emailNormalized, emailNormalized: invitation.emailNormalized, displayName: dto.displayName.trim(), status: UserStatus.ACTIVE, roles: [UserRole.PROVIDER] }));
        await credentialRepository.save(credentialRepository.create({ userId: user.id, passwordHash }));
        provider.userId = user.id; provider.email = provider.email ?? invitation.emailNormalized;
        if (provider.onboardingStatus !== ProviderOnboardingStatus.APPROVED) {
          provider.status = ProviderStatus.PENDING;
          if (this.complete(provider)) { provider.onboardingStatus = ProviderOnboardingStatus.SUBMITTED; provider.submittedAt = now; } else provider.onboardingStatus = ProviderOnboardingStatus.DRAFT;
          provider.reviewedAt = null; provider.reviewedByUserId = null; provider.reviewNote = null;
        }
        await providerRepository.save(provider);
        invitation.status = ProviderInvitationStatus.ACCEPTED; invitation.acceptedAt = now; await invitationRepository.save(invitation);
        return { providerDisplayName: provider.displayName, email: invitation.email, status: ProviderInvitationStatus.ACCEPTED as const, loginRequired: true as const };
      });
      return result;
    } catch (error) { if (error instanceof QueryFailedError) throw new ConflictException('Invitation acceptance conflicted with an existing account or provider link'); throw error; }
  }

  private async findUsable(token: string): Promise<ProviderInvitation> { const invitation = await this.invitations.createQueryBuilder('invitation').withDeleted().leftJoinAndSelect('invitation.provider', 'provider').where('invitation.tokenHash = :tokenHash', { tokenHash: this.hash(token) }).getOne(); if (!invitation || invitation.status !== ProviderInvitationStatus.PENDING || invitation.revokedAt || !invitation.provider || invitation.provider.deletedAt || invitation.provider.userId) this.invalid(); if (invitation.expiresAt <= new Date()) this.expired(); return invitation; }
  private async requireProvider(id: string): Promise<Provider> { const provider = await this.providers.findOne({ where: { id }, withDeleted: true }); if (!provider || provider.deletedAt) throw new NotFoundException('Provider not found'); return provider; }
  private async requireAdminInvitation(id: string): Promise<ProviderInvitation> { const invitation = await this.invitations.findOne({ where: { id }, relations: { provider: true, createdBy: true } }); if (!invitation) throw new NotFoundException('Provider invitation not found'); return invitation; }
  private adminSummary(invitation: ProviderInvitation): AdminProviderInvitationSummaryDto { const effectiveStatus = invitation.status === ProviderInvitationStatus.PENDING && invitation.expiresAt <= new Date() ? ProviderInvitationStatus.EXPIRED : invitation.status; return { id: invitation.id, provider: { displayName: invitation.provider.displayName }, email: invitation.email, status: effectiveStatus, expiresAt: invitation.expiresAt, acceptedAt: invitation.acceptedAt, revokedAt: invitation.revokedAt, createdAt: invitation.createdAt, createdBy: invitation.createdBy ? { id: invitation.createdBy.id, email: invitation.createdBy.email, displayName: invitation.createdBy.displayName } : null }; }
  private async deliver(invitation: ProviderInvitation, rawToken: string): Promise<CreatedProviderInvitationResponseDto> { const invitationLink = this.invitationLink(rawToken); try { const delivery = await this.emailProvider.sendTransactionalEmail(this.invitationEmail(invitation, invitationLink)); if (delivery.outcome === EmailSendOutcome.SENT) return { ...this.adminSummary(invitation), deliveryStatus: ProviderInvitationDeliveryStatus.SENT }; return { ...this.adminSummary(invitation), deliveryStatus: ProviderInvitationDeliveryStatus.MANUAL_REQUIRED, manualInvitationLink: invitationLink }; } catch { this.logger.warn(`Provider invitation email delivery failed for invitation ${invitation.id}`); return { ...this.adminSummary(invitation), deliveryStatus: ProviderInvitationDeliveryStatus.FAILED, manualInvitationLink: invitationLink }; } }
  private createdProvider(provider: Provider) { return { id: provider.id, displayName: provider.displayName, email: provider.email, phone: provider.phone, professionalReference: provider.professionalReference, providerType: provider.providerType, countryCode: provider.countryCode, stateOrRegion: provider.stateOrRegion, city: provider.city, status: provider.status, onboardingStatus: provider.onboardingStatus, submittedAt: provider.submittedAt, reviewedAt: provider.reviewedAt, reviewNote: provider.reviewNote, linkedUser: null, createdAt: provider.createdAt, updatedAt: provider.updatedAt, capabilityCount: 0, locationCount: 0 }; }
  private complete(provider: Provider): boolean { return [provider.displayName, provider.email, provider.providerType, provider.countryCode, provider.stateOrRegion, provider.city].every(Boolean); }
  private hash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  private invitationLink(token: string): string { return `${this.config.providerInvitations.frontendUrl.replace(/\/+$/, '')}/${encodeURIComponent(token)}`; }
  private invitationEmail(invitation: ProviderInvitation, link: string) {
    const providerName = invitation.provider.displayName;
    const expiresAt = invitation.expiresAt.toISOString();
    const text = `SmartClinic provider invitation\n\nYou have been invited to set up the provider account for ${providerName} using ${invitation.email}.\n\nComplete setup: ${link}\n\nThis link expires at ${expiresAt} and can be used only once. If you did not expect this invitation, ignore this email or contact SmartClinic.`;
    const html = `<h1>SmartClinic provider invitation</h1><p>You have been invited to set up the provider account for <strong>${this.escapeHtml(providerName)}</strong> using ${this.escapeHtml(invitation.email)}.</p><p><a href="${this.escapeHtml(link)}">Set up provider account</a></p><p>This single-use link expires at ${this.escapeHtml(expiresAt)}.</p><p>If you did not expect this invitation, ignore this email or contact SmartClinic.</p>`;
    return { to: invitation.email, fromAddress: this.config.email.fromAddress, fromName: this.config.email.fromName, subject: `Set up your SmartClinic provider account`, html, text, idempotencyKey: `provider-invitation:${invitation.id}:initial` };
  }
  private escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!); }
  private mask(email: string): string { const [local, domain] = email.split('@'); return `${local.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`; }
  private invalid(): never { throw new NotFoundException('Provider invitation is invalid or unavailable'); }
  private expired(): never { throw new HttpException('Provider invitation is invalid or expired', HttpStatus.GONE); }
}
