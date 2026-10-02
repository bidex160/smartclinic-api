import { ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { EntityManager, Not, Repository } from 'typeorm';

import { appConfig } from '../config/app.config';
import { EMAIL_PROVIDER, EmailProvider, EmailSendOutcome } from '../notifications/email/email-provider';
import { renderTransactionalEmail, sanitizeEmailSubject } from '../notifications/email/transactional-email-renderer';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { canManage, canPrescribe, CurrentProviderService, DIRECT_SENDER_TYPES, ProviderActor } from './current-provider.service';
import { InviteProviderMemberDto } from './dto/provider-team.dto';
import { Provider } from './entities/provider.entity';
import { ProviderMember } from './entities/provider-member.entity';
import { ProviderMemberRole, ProviderMemberStatus } from './enums/provider-member.enum';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const PROVIDER_MEMBER_ROLE_LABEL: Record<ProviderMemberRole, string> = {
  [ProviderMemberRole.ADMIN]: 'Team admin',
  [ProviderMemberRole.DOCTOR]: 'Doctor',
  [ProviderMemberRole.NURSE]: 'Nurse',
  [ProviderMemberRole.LAB_SCIENTIST]: 'Lab scientist',
  [ProviderMemberRole.PHARMACIST]: 'Pharmacist',
  [ProviderMemberRole.FRONT_DESK]: 'Front desk',
};

export type InviteDeliveryStatus = 'SENT' | 'MANUAL_REQUIRED' | 'FAILED';

/** Staff logins at a facility: invite, change role, remove, and accept an invitation. */
@Injectable()
export class ProviderTeamService {
  private readonly logger = new Logger(ProviderTeamService.name);

  constructor(
    @InjectRepository(ProviderMember) private readonly members: Repository<ProviderMember>,
    private readonly currentProvider: CurrentProviderService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  /** What this user is at their facility. Powers their home screen and menu. */
  async me(user: User) {
    const actor = await this.currentProvider.resolveActor(user);
    return this.actorView(actor);
  }

  async list(user: User) {
    const actor = await this.manager(user);
    const rows = await this.members.find({
      where: { providerId: actor.provider.id, status: Not(ProviderMemberStatus.REMOVED) },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    return { items: rows.map((row) => this.memberView(row)) };
  }

  async invite(user: User, dto: InviteProviderMemberDto) {
    const actor = await this.manager(user);
    const email = dto.email.trim().toLowerCase();
    const raw = this.newToken();
    const member = await this.members.manager.transaction(async (m) => {
      const owner = actor.provider.userId ? await m.getRepository(User).findOne({ where: { id: actor.provider.userId } }) : null;
      if (owner?.emailNormalized === email) throw new ConflictException('This email is the facility’s own account');
      const open = await m.getRepository(ProviderMember).findOne({ where: { providerId: actor.provider.id, emailNormalized: email, status: Not(ProviderMemberStatus.REMOVED) } });
      if (open) throw new ConflictException(open.status === ProviderMemberStatus.ACTIVE ? 'This person is already on your team' : 'This person already has an invitation. Resend it instead.');
      const repo = m.getRepository(ProviderMember);
      return repo.save(repo.create({
        providerId: actor.provider.id,
        userId: null,
        emailNormalized: email,
        displayName: dto.displayName?.trim() || null,
        role: dto.role,
        status: ProviderMemberStatus.INVITED,
        inviteTokenHash: this.hash(raw),
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedByUserId: user.id,
        joinedAt: null,
        removedAt: null,
      }));
    });
    return this.deliver(actor.provider, member, raw);
  }

  async resend(user: User, id: string) {
    const actor = await this.manager(user);
    const member = await this.owned(actor, id);
    if (member.status !== ProviderMemberStatus.INVITED) throw new ConflictException('Only pending invitations can be resent');
    const raw = this.newToken();
    member.inviteTokenHash = this.hash(raw);
    member.inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.members.save(member);
    return this.deliver(actor.provider, member, raw);
  }

  async updateRole(user: User, id: string, role: ProviderMemberRole) {
    const actor = await this.manager(user);
    const member = await this.owned(actor, id);
    if (member.status === ProviderMemberStatus.REMOVED) throw new ConflictException('This person is no longer on your team');
    if (member.id === actor.memberId && role !== ProviderMemberRole.ADMIN) throw new ConflictException('Ask another admin or the facility owner to change your own role');
    member.role = role;
    await this.members.save(member);
    return this.memberView({ ...member, user: member.userId ? await this.members.manager.getRepository(User).findOne({ where: { id: member.userId } }) : null } as ProviderMember);
  }

  async remove(user: User, id: string) {
    const actor = await this.manager(user);
    if (id === actor.memberId) throw new ConflictException('You can’t remove yourself. Ask another admin or the facility owner.');
    return this.members.manager.transaction(async (m) => {
      const member = await m.getRepository(ProviderMember).findOne({ where: { id, providerId: actor.provider.id }, lock: { mode: 'pessimistic_write' } });
      if (!member || member.status === ProviderMemberStatus.REMOVED) throw new NotFoundException('Team member was not found');
      const formerUserId = member.userId;
      member.status = ProviderMemberStatus.REMOVED;
      member.removedAt = new Date();
      member.inviteTokenHash = null;
      await m.getRepository(ProviderMember).save(member);
      if (formerUserId) await this.dropProviderRoleIfUnused(m, formerUserId);
      return { removed: true as const };
    });
  }

  /** Public: what an invitation is for, before the person signs in. */
  async inspect(token: string) {
    const member = await this.members.findOne({ where: { inviteTokenHash: this.hash(token) }, relations: { provider: true } });
    if (!member || member.status !== ProviderMemberStatus.INVITED || !member.provider || member.provider.deletedAt) throw new NotFoundException('This invitation is invalid or has already been used');
    if (!member.inviteExpiresAt || member.inviteExpiresAt < new Date()) throw new HttpException('This invitation has expired. Ask your facility to resend it.', HttpStatus.GONE);
    return {
      providerDisplayName: member.provider.displayName,
      providerType: member.provider.providerType,
      role: member.role,
      roleLabel: PROVIDER_MEMBER_ROLE_LABEL[member.role],
      invitedEmail: this.mask(member.emailNormalized),
      expiresAt: member.inviteExpiresAt,
    };
  }

  /** The signed-in person joins the facility. Their email must match the invitation. */
  async accept(user: User, token: string) {
    await this.members.manager.transaction(async (m) => {
      const member = await m.getRepository(ProviderMember).findOne({ where: { inviteTokenHash: this.hash(token) }, lock: { mode: 'pessimistic_write' } });
      if (!member || member.status !== ProviderMemberStatus.INVITED) throw new NotFoundException('This invitation is invalid or has already been used');
      if (!member.inviteExpiresAt || member.inviteExpiresAt < new Date()) throw new HttpException('This invitation has expired. Ask your facility to resend it.', HttpStatus.GONE);
      const account = await m.getRepository(User).findOne({ where: { id: user.id }, lock: { mode: 'pessimistic_write' } });
      if (!account || account.emailNormalized !== member.emailNormalized) throw new ForbiddenException('Sign in with the email address this invitation was sent to');
      const provider = await m.getRepository(Provider).findOne({ where: { id: member.providerId } });
      if (!provider || provider.deletedAt || ![ProviderStatus.PENDING, ProviderStatus.ACTIVE].includes(provider.status)) throw new ConflictException('This facility isn’t accepting new team members right now');
      if (await m.getRepository(Provider).exists({ where: { userId: user.id } })) throw new ConflictException('This account already runs its own provider account. Use a different email to join a team.');
      if (await m.getRepository(ProviderMember).exists({ where: { userId: user.id, status: ProviderMemberStatus.ACTIVE } })) throw new ConflictException('This account already belongs to another facility’s team');
      member.status = ProviderMemberStatus.ACTIVE;
      member.userId = user.id;
      member.joinedAt = new Date();
      member.inviteTokenHash = null;
      if (!member.displayName) member.displayName = account.displayName ?? null;
      await m.getRepository(ProviderMember).save(member);
      if (!account.roles.includes(UserRole.PROVIDER)) {
        account.roles = [...account.roles, UserRole.PROVIDER];
        await m.getRepository(User).save(account);
      }
    });
    return this.me({ ...user, roles: user.roles.includes(UserRole.PROVIDER) ? user.roles : [...user.roles, UserRole.PROVIDER] } as User);
  }

  private actorView(actor: ProviderActor) {
    return {
      isOwner: actor.isOwner,
      role: actor.role,
      roleLabel: actor.role ? PROVIDER_MEMBER_ROLE_LABEL[actor.role] : 'Owner',
      canManageTeam: canManage(actor),
      // Mirrors what the request endpoints enforce, so the app never offers an action the API will refuse.
      awaitingApproval: actor.provider.onboardingStatus !== ProviderOnboardingStatus.APPROVED,
      canSendRequests:
        canPrescribe(actor) &&
        actor.provider.status === ProviderStatus.ACTIVE &&
        actor.provider.onboardingStatus === ProviderOnboardingStatus.APPROVED &&
        DIRECT_SENDER_TYPES.has(actor.provider.providerType),
      provider: {
        providerReference: actor.provider.providerReference,
        displayName: actor.provider.displayName,
        providerType: actor.provider.providerType,
      },
    };
  }

  private memberView(row: ProviderMember) {
    return {
      id: row.id,
      displayName: row.displayName ?? row.user?.displayName ?? null,
      email: row.emailNormalized,
      role: row.role,
      roleLabel: PROVIDER_MEMBER_ROLE_LABEL[row.role],
      status: row.status,
      joinedAt: row.joinedAt,
      inviteExpiresAt: row.status === ProviderMemberStatus.INVITED ? row.inviteExpiresAt : null,
      createdAt: row.createdAt,
    };
  }

  private async manager(user: User): Promise<ProviderActor> {
    const actor = await this.currentProvider.resolveActor(user);
    if (!canManage(actor)) throw new ForbiddenException('Only the facility owner or a team admin can manage the team');
    return actor;
  }

  private async owned(actor: ProviderActor, id: string) {
    const member = await this.members.findOne({ where: { id, providerId: actor.provider.id } });
    if (!member) throw new NotFoundException('Team member was not found');
    return member;
  }

  private async deliver(provider: Provider, member: ProviderMember, raw: string) {
    const inviteUrl = `${this.config.frontendUrl.replace(/\/+$/, '')}/provider/join/${encodeURIComponent(raw)}`;
    let deliveryStatus: InviteDeliveryStatus = 'FAILED';
    try {
      const role = PROVIDER_MEMBER_ROLE_LABEL[member.role];
      const rendered = renderTransactionalEmail({
        preheader: `Join ${provider.displayName} on SmartClinic.`,
        title: `Join ${provider.displayName} on SmartClinic`,
        body: [
          `${provider.displayName} has invited you to join their team on SmartClinic as ${role.toLowerCase()}.`,
          'Sign in or create your SmartClinic account with this email address, then accept the invitation. The link expires in 7 days.',
        ],
        action: { label: 'Accept invitation', url: inviteUrl },
        details: [{ label: 'Role', value: role }],
      }, { logoUrl: this.config.email.logoUrl });
      const result = await this.email.sendTransactionalEmail({
        to: member.emailNormalized,
        fromAddress: this.config.email.fromAddress,
        fromName: this.config.email.fromName,
        subject: sanitizeEmailSubject(`Join ${provider.displayName} on SmartClinic`),
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: `provider-member:${member.id}:${member.inviteTokenHash?.slice(0, 16)}`,
      });
      deliveryStatus = result.outcome === EmailSendOutcome.SENT ? 'SENT' : 'MANUAL_REQUIRED';
    } catch {
      this.logger.warn('Team invitation email could not be sent');
    }
    // The link is returned once so the inviter can also share it directly (e.g. on WhatsApp).
    return { member: this.memberView(member), inviteUrl, deliveryStatus };
  }

  private async dropProviderRoleIfUnused(m: EntityManager, userId: string) {
    const ownsProvider = await m.getRepository(Provider).exists({ where: { userId } });
    const otherMembership = await m.getRepository(ProviderMember).exists({ where: { userId, status: ProviderMemberStatus.ACTIVE } });
    if (ownsProvider || otherMembership) return;
    const account = await m.getRepository(User).findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
    if (account?.roles.includes(UserRole.PROVIDER)) {
      account.roles = account.roles.filter((role) => role !== UserRole.PROVIDER);
      if (!account.roles.length) account.roles = [UserRole.USER];
      await m.getRepository(User).save(account);
    }
  }

  private newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private mask(email: string): string {
    const [local, domain] = email.split('@');
    return `${local.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
  }
}
