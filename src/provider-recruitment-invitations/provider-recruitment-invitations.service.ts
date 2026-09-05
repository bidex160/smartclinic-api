import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { appConfig } from '../config/app.config';
import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { EMAIL_PROVIDER, EmailProvider, EmailSendOutcome } from '../notifications/email/email-provider';
import { User } from '../users/entities/user.entity';
import { CreateProviderRecruitmentInvitationDto } from './dto/create-provider-recruitment-invitation.dto';
import { ProviderRecruitmentInvitationResponseDto } from './dto/provider-recruitment-invitation-response.dto';
import { ProviderRecruitmentInvitation } from './entities/provider-recruitment-invitation.entity';
import { ProviderRecruitmentEmailStatus, ProviderRecruitmentInvitationStatus } from './enums/provider-recruitment-invitation.enum';
import { generateProviderRecruitmentInvitationReference } from './provider-recruitment-invitation-reference';

@Injectable()
export class ProviderRecruitmentInvitationsService {
  private readonly logger = new Logger(ProviderRecruitmentInvitationsService.name);

  constructor(
    @InjectRepository(ProviderRecruitmentInvitation) private readonly invitations: Repository<ProviderRecruitmentInvitation>,
    @InjectRepository(HealthCheckPackage) private readonly packages: Repository<HealthCheckPackage>,
    @InjectRepository(FulfilmentMode) private readonly fulfilmentModes: Repository<FulfilmentMode>,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async create(user: User, dto: CreateProviderRecruitmentInvitationDto): Promise<ProviderRecruitmentInvitationResponseDto> {
    if (!dto.email && !dto.phone) throw new BadRequestException('At least one of email or phone is required');

    const [healthCheckPackage, fulfilmentMode] = await Promise.all([
      this.packages.findOne({ where: { code: dto.packageCode, isActive: true } }),
      this.fulfilmentModes.findOne({ where: { code: dto.fulfilmentModeCode, isActive: true } }),
    ]);
    if (!healthCheckPackage) throw new NotFoundException('Active Health Check package not found');
    if (!fulfilmentMode) throw new NotFoundException('Active fulfilment mode not found');

    const submissionKey = this.submissionKey(user.id, dto);
    let invitation: ProviderRecruitmentInvitation;
    let created = true;
    try {
      invitation = await this.invitations.save(this.invitations.create({
        reference: generateProviderRecruitmentInvitationReference(),
        invitedByUserId: user.id,
        organisationName: dto.organisationName,
        email: dto.email ?? null,
        emailNormalized: dto.email ?? null,
        phone: dto.phone ?? null,
        source: dto.source,
        status: ProviderRecruitmentInvitationStatus.PENDING,
        packageCode: healthCheckPackage.code,
        serviceCode: null,
        fulfilmentModeCode: fulfilmentMode.code,
        preferredDate: dto.preferredDate ?? null,
        preferredTime: dto.preferredTime ?? null,
        countryCode: dto.countryCode ?? null,
        stateOrRegion: dto.stateOrRegion ?? null,
        city: dto.city ?? null,
        emailNotificationStatus: dto.email ? ProviderRecruitmentEmailStatus.PENDING : ProviderRecruitmentEmailStatus.NOT_APPLICABLE,
        emailNotificationFailureReason: null,
        submissionKey,
        acceptedAt: null,
        providerId: null,
      }));
    } catch (error) {
      if (!(error instanceof QueryFailedError)) throw error;
      const existing = await this.invitations.findOne({ where: { submissionKey } });
      if (!existing) throw error;
      invitation = existing;
      created = false;
    }

    if (created && invitation.email) await this.deliver(invitation);
    return this.response(invitation);
  }

  private async deliver(invitation: ProviderRecruitmentInvitation): Promise<void> {
    try {
      const result = await this.emailProvider.sendTransactionalEmail(this.email(invitation));
      invitation.emailNotificationStatus = result.outcome === EmailSendOutcome.SENT
        ? ProviderRecruitmentEmailStatus.SENT
        : ProviderRecruitmentEmailStatus.FAILED;
      invitation.emailNotificationFailureReason = result.outcome === EmailSendOutcome.SENT ? null : 'EMAIL_PROVIDER_UNAVAILABLE';
    } catch {
      invitation.emailNotificationStatus = ProviderRecruitmentEmailStatus.FAILED;
      invitation.emailNotificationFailureReason = 'EMAIL_DELIVERY_FAILED';
      this.logger.warn(`Provider recruitment invitation email delivery failed for ${invitation.reference}`);
    }
    try {
      await this.invitations.save(invitation);
    } catch {
      this.logger.error(`Could not persist email notification state for provider recruitment invitation ${invitation.reference}`);
    }
  }

  private email(invitation: ProviderRecruitmentInvitation) {
    const location = [invitation.city, invitation.stateOrRegion, invitation.countryCode].filter(Boolean).join(', ');
    const registrationUrl = `${this.config.frontendUrl.replace(/\/+$/, '')}/provider/register`;
    const context = [`Health Check package: ${invitation.packageCode}`, location ? `Location: ${location}` : null].filter(Boolean).join('\n');
    const htmlContext = [`<li>Health Check package: ${this.escapeHtml(invitation.packageCode ?? '')}</li>`, location ? `<li>Location: ${this.escapeHtml(location)}</li>` : null].filter(Boolean).join('');
    return {
      to: invitation.email!, fromAddress: this.config.email.fromAddress, fromName: this.config.email.fromName,
      subject: 'A SmartClinic patient invited your organisation',
      text: `SmartClinic provider invitation\n\nA SmartClinic patient invited ${invitation.organisationName} to join the SmartClinic Network.\n\n${context}\n\nRegister your organisation: ${registrationUrl}\n\nThis invitation does not create a provider account or booking.`,
      html: `<h1>Join the SmartClinic Network</h1><p>A SmartClinic patient invited <strong>${this.escapeHtml(invitation.organisationName)}</strong> to join the SmartClinic Network.</p><ul>${htmlContext}</ul><p><a href="${this.escapeHtml(registrationUrl)}">Register your organisation</a></p><p>This invitation does not create a provider account or booking.</p>`,
      idempotencyKey: `provider-recruitment-invitation:${invitation.id}:initial`,
    };
  }

  private response(invitation: ProviderRecruitmentInvitation): ProviderRecruitmentInvitationResponseDto {
    return { reference: invitation.reference, organisationName: invitation.organisationName, email: invitation.email, phone: invitation.phone, source: invitation.source, status: invitation.status, context: { packageCode: invitation.packageCode, serviceCode: invitation.serviceCode, fulfilmentModeCode: invitation.fulfilmentModeCode, preferredDate: invitation.preferredDate, preferredTime: invitation.preferredTime?.slice(0, 5) ?? null, countryCode: invitation.countryCode, stateOrRegion: invitation.stateOrRegion, city: invitation.city }, createdAt: invitation.createdAt };
  }

  private submissionKey(userId: string, dto: CreateProviderRecruitmentInvitationDto): string {
    const fiveMinuteBucket = Math.floor(Date.now() / 300_000);
    return createHash('sha256').update(JSON.stringify([
      userId, fiveMinuteBucket, dto.organisationName, dto.email ?? null, dto.phone ?? null,
      dto.source, dto.packageCode, dto.fulfilmentModeCode, dto.preferredDate ?? null,
      dto.preferredTime ?? null, dto.countryCode ?? null, dto.stateOrRegion ?? null, dto.city ?? null,
    ])).digest('hex');
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  }
}
