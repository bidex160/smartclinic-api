import { ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { Provider } from './entities/provider.entity';
import { ProviderMember } from './entities/provider-member.entity';
import { ProviderMemberRole, ProviderMemberStatus } from './enums/provider-member.enum';
import { ProviderTeamService } from './provider-team.service';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

describe('ProviderTeamService', () => {
  const provider: any = { id: 'provider-1', userId: 'owner-user', displayName: 'Lagoon Hospital', providerType: 'HOSPITAL', providerReference: 'SCPR-1', status: 'ACTIVE', onboardingStatus: 'APPROVED', deletedAt: null };
  let actor: any;
  let members: any;
  let users: any;
  let providers: any;
  let rows: any[];
  let email: any;
  let service: ProviderTeamService;

  beforeEach(() => {
    actor = { provider, isOwner: true, role: null, memberId: null };
    rows = [];
    const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: [string, any]) => (value && typeof value === 'object' && '_type' in value ? row[key] !== value._value : row[key] === value));
    members = {
      create: jest.fn((value) => ({ id: `member-${rows.length + 1}`, createdAt: new Date(), ...value })),
      save: jest.fn(async (value) => { const index = rows.findIndex((row) => row.id === value.id); if (index >= 0) rows[index] = value; else rows.push(value); return value; }),
      findOne: jest.fn(async ({ where, relations }: any) => { const row = rows.find((r) => matches(r, where)); return row ? (relations?.provider ? { ...row, provider } : row) : null; }),
      find: jest.fn(async () => rows.filter((row) => row.status !== 'REMOVED')),
      exists: jest.fn(async ({ where }: any) => rows.some((row) => matches(row, where))),
    };
    users = {
      'owner-user': { id: 'owner-user', emailNormalized: 'owner@lagoon.ng', roles: [UserRole.PROVIDER] },
      'ngozi-user': { id: 'ngozi-user', emailNormalized: 'ngozi@lagoon.ng', displayName: 'Ngozi Eze', roles: [UserRole.USER] },
    };
    const userRepo = {
      findOne: jest.fn(async ({ where }: any) => users[where.id] ?? null),
      save: jest.fn(async (value) => (users[value.id] = value)),
    };
    providers = { findOne: jest.fn(async () => provider), exists: jest.fn(async ({ where }: any) => where.userId === 'owner-user') };
    const manager: any = {
      transaction: (work: any) => work(manager),
      getRepository: (entity: unknown) => (entity === ProviderMember ? members : entity === User ? userRepo : entity === Provider ? providers : null),
    };
    members.manager = manager;
    email = { sendTransactionalEmail: jest.fn().mockResolvedValue({ outcome: 'SENT' }) };
    const config: any = { frontendUrl: 'https://app.smartclinic.ng/', email: { fromAddress: 'hello@smartclinic.ng', fromName: 'SmartClinic', logoUrl: undefined } };
    service = new ProviderTeamService(members, { resolveActor: jest.fn(async () => actor) } as any, email, config);
  });

  it('invites by email with a one-time link and emails it', async () => {
    const result = await service.invite({ id: 'owner-user' } as User, { email: 'ngozi@lagoon.ng', role: ProviderMemberRole.LAB_SCIENTIST, displayName: 'Ngozi' });
    expect(result.deliveryStatus).toBe('SENT');
    expect(result.inviteUrl).toMatch(/^https:\/\/app\.smartclinic\.ng\/provider\/join\/[A-Za-z0-9_-]{43}$/);
    expect(rows[0]).toMatchObject({ status: 'INVITED', role: 'LAB_SCIENTIST', emailNormalized: 'ngozi@lagoon.ng', userId: null });
    expect(rows[0].inviteTokenHash).toBe(hash(result.inviteUrl.split('/').pop()!));
    expect(email.sendTransactionalEmail.mock.calls[0][0]).toMatchObject({ to: 'ngozi@lagoon.ng', subject: 'Join Lagoon Hospital on SmartClinic' });
  });

  it('does not offer sending requests until the facility is approved', async () => {
    expect(await service.me({ id: 'owner-user' } as User)).toMatchObject({ canSendRequests: true, awaitingApproval: false });
    provider.onboardingStatus = 'SUBMITTED';
    try {
      expect(await service.me({ id: 'owner-user' } as User)).toMatchObject({ canSendRequests: false, awaitingApproval: true });
    } finally {
      provider.onboardingStatus = 'APPROVED';
    }
  });

  it('refuses duplicate invitations and the facility’s own email', async () => {
    await service.invite({ id: 'owner-user' } as User, { email: 'ngozi@lagoon.ng', role: ProviderMemberRole.LAB_SCIENTIST });
    await expect(service.invite({ id: 'owner-user' } as User, { email: 'ngozi@lagoon.ng', role: ProviderMemberRole.DOCTOR })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.invite({ id: 'owner-user' } as User, { email: 'owner@lagoon.ng', role: ProviderMemberRole.DOCTOR })).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets only the owner and team admins manage the team', async () => {
    actor = { provider, isOwner: false, role: ProviderMemberRole.PHARMACIST, memberId: 'member-9' };
    await expect(service.list({ id: 'x' } as User)).rejects.toBeInstanceOf(ForbiddenException);
    actor = { provider, isOwner: false, role: ProviderMemberRole.ADMIN, memberId: 'member-9' };
    await expect(service.list({ id: 'x' } as User)).resolves.toEqual({ items: [] });
  });

  it('accepts an invitation for the matching signed-in account and grants provider access', async () => {
    const { inviteUrl } = await service.invite({ id: 'owner-user' } as User, { email: 'ngozi@lagoon.ng', role: ProviderMemberRole.LAB_SCIENTIST });
    const token = inviteUrl.split('/').pop()!;
    await expect(service.inspect(token)).resolves.toMatchObject({ providerDisplayName: 'Lagoon Hospital', roleLabel: 'Lab scientist', invitedEmail: 'n****@lagoon.ng' });

    actor = { provider, isOwner: false, role: ProviderMemberRole.LAB_SCIENTIST, memberId: 'member-1' };
    const me = await service.accept(users['ngozi-user'], token);
    expect(rows[0]).toMatchObject({ status: 'ACTIVE', userId: 'ngozi-user', inviteTokenHash: null, displayName: 'Ngozi Eze' });
    expect(users['ngozi-user'].roles).toEqual([UserRole.USER, UserRole.PROVIDER]);
    expect(me).toMatchObject({ role: 'LAB_SCIENTIST', roleLabel: 'Lab scientist', canSendRequests: false, canManageTeam: false });
    await expect(service.accept(users['ngozi-user'], token)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses an invitation for a different email, or one that has expired', async () => {
    const { inviteUrl } = await service.invite({ id: 'owner-user' } as User, { email: 'someone@else.ng', role: ProviderMemberRole.DOCTOR });
    const token = inviteUrl.split('/').pop()!;
    await expect(service.accept(users['ngozi-user'], token)).rejects.toBeInstanceOf(ForbiddenException);
    rows[0].inviteExpiresAt = new Date(Date.now() - 1000);
    await expect(service.inspect(token)).rejects.toBeInstanceOf(HttpException);
  });

  it('removing a member ends their access and drops provider access they no longer need', async () => {
    rows.push({ id: 'member-1', providerId: 'provider-1', userId: 'ngozi-user', emailNormalized: 'ngozi@lagoon.ng', role: 'PHARMACIST', status: ProviderMemberStatus.ACTIVE });
    users['ngozi-user'].roles = [UserRole.USER, UserRole.PROVIDER];
    await service.remove({ id: 'owner-user' } as User, 'member-1');
    expect(rows[0]).toMatchObject({ status: 'REMOVED' });
    expect(users['ngozi-user'].roles).toEqual([UserRole.USER]);
  });

  it('stops admins from demoting or removing themselves', async () => {
    rows.push({ id: 'member-9', providerId: 'provider-1', userId: 'admin-user', emailNormalized: 'a@l.ng', role: 'ADMIN', status: ProviderMemberStatus.ACTIVE });
    actor = { provider, isOwner: false, role: ProviderMemberRole.ADMIN, memberId: 'member-9' };
    await expect(service.updateRole({ id: 'admin-user' } as User, 'member-9', ProviderMemberRole.DOCTOR)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove({ id: 'admin-user' } as User, 'member-9')).rejects.toBeInstanceOf(ConflictException);
  });
});
