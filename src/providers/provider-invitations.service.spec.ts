import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { UserCredential } from '../users/entities/user-credential.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { ProviderInvitation } from './entities/provider-invitation.entity';
import { Provider } from './entities/provider.entity';
import { ProviderInvitationStatus } from './enums/provider-invitation-status.enum';
import { ProviderInvitationsService } from './provider-invitations.service';
import { EmailSendOutcome } from '../notifications/email/email-provider';

describe('ProviderInvitationsService', () => {
  let provider: any, creator: any, invitationRows: any[], userRows: any[], credentialRows: any[], invitations: any, providers: any, users: any, credentials: any, emailProvider: any, subject: ProviderInvitationsService;
  beforeEach(() => {
    provider = { id: '10000000-0000-4000-8000-000000000001', displayName: 'SmartClinic Ikeja', userId: null, deletedAt: null, services: [{ id: 'capability-preserved' }] };
    creator = { id: '20000000-0000-4000-8000-000000000001', email: 'ops@example.test', displayName: 'Ops', status: UserStatus.ACTIVE, roles: [UserRole.OPERATIONS], deletedAt: null };
    invitationRows = []; userRows = [creator]; credentialRows = [];
    providers = { findOne: jest.fn(async () => provider), save: jest.fn(async (value) => { provider = value; return value; }) };
    users = { exists: jest.fn(async ({ where }: any) => userRows.some((row) => row.emailNormalized === where.emailNormalized)), findOne: jest.fn(), create: jest.fn((value) => value), save: jest.fn(async (value) => { const saved = { id: value.id ?? `user-${userRows.length}`, deletedAt: null, ...value }; userRows.push(saved); return saved; }) };
    credentials = { create: jest.fn((value) => value), save: jest.fn(async (value) => { credentialRows.push(value); return value; }) };
    const hydrate = (row: any) => row ? { ...row, provider, createdBy: creator } : null;
    invitations = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => { const existing = invitationRows.findIndex((row) => row.id === value.id); const saved = { id: value.id ?? `invitation-${invitationRows.length + 1}`, createdAt: value.createdAt ?? new Date(), updatedAt: new Date(), ...value }; if (existing >= 0) invitationRows[existing] = saved; else invitationRows.push(saved); return saved; }),
      findOne: jest.fn(async ({ where }: any) => hydrate(invitationRows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)))),
      find: jest.fn(async ({ where }: any) => invitationRows.filter((row) => row.providerId === where.providerId).map(hydrate)),
    };
    invitations.createQueryBuilder = jest.fn(() => { let tokenHash = ''; const builder: any = { withDeleted: jest.fn().mockReturnThis(), leftJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn((_sql, params) => { tokenHash = params.tokenHash; return builder; }), getOne: jest.fn(async () => hydrate(invitationRows.find((row) => row.tokenHash === tokenHash))) }; return builder; });
    const manager: any = { getRepository: jest.fn((entity) => entity === ProviderInvitation ? invitations : entity === Provider ? providers : entity === User ? users : entity === UserCredential ? credentials : {}) };
    manager.transaction = jest.fn(async (work) => work(manager)); invitations.manager = manager;
    emailProvider = { sendTransactionalEmail: jest.fn().mockResolvedValue({ outcome: EmailSendOutcome.UNAVAILABLE }) };
    subject = new ProviderInvitationsService(invitations, providers, users, { providerInvitations: { ttlSeconds: 3600, frontendUrl: 'https://app.example.test/provider/setup' }, email: { provider: 'none', fromAddress: 'hello@example.test', fromName: 'SmartClinic' } } as never, emailProvider);
  });

  async function created() { return subject.create(provider.id, 'Provider@Example.COM', creator.id); }
  function token(result: any) { return result.manualInvitationLink.split('/').at(-1); }

  it('creates an invitation, returns a configured manual link once, and stores only its hash', async () => { const result = await created(); const rawToken = token(result); expect(result.deliveryStatus).toBe('MANUAL_REQUIRED'); expect(result.manualInvitationLink).toBe(`https://app.example.test/provider/setup/${rawToken}`); expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(invitationRows[0].tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex')); expect(JSON.stringify(invitationRows[0])).not.toContain(rawToken); });
  it('sends text and HTML and omits token material after successful delivery', async () => { emailProvider.sendTransactionalEmail.mockResolvedValue({ outcome: EmailSendOutcome.SENT }); const result = await created(); expect(result).toMatchObject({ deliveryStatus: 'SENT' }); expect(result).not.toHaveProperty('manualInvitationLink'); expect(emailProvider.sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'provider@example.com', text: expect.stringContaining('used only once'), html: expect.stringContaining('<a href=') })); });
  it('keeps the invitation and returns a manual link when sending fails', async () => { emailProvider.sendTransactionalEmail.mockRejectedValue(new Error('vendor secret detail')); const result = await created(); expect(result).toMatchObject({ deliveryStatus: 'FAILED', manualInvitationLink: expect.stringMatching(/[A-Za-z0-9_-]{43}$/) }); expect(invitationRows).toHaveLength(1); expect(JSON.stringify(result)).not.toContain('vendor secret detail'); });
  it('rejects a linked provider and an existing account email', async () => { provider.userId = 'linked'; await expect(created()).rejects.toBeInstanceOf(ConflictException); provider.userId = null; userRows.push({ emailNormalized: 'provider@example.com' }); await expect(created()).rejects.toBeInstanceOf(ConflictException); });
  it('rejects a duplicate active invitation', async () => { await created(); await expect(created()).rejects.toBeInstanceOf(ConflictException); });
  it('lists summaries without raw tokens or hashes', async () => { const creation = await created(); const result: any[] = await subject.list(provider.id); expect(result[0]).not.toHaveProperty('manualInvitationLink'); expect(result[0]).not.toHaveProperty('tokenHash'); expect(JSON.stringify(result)).not.toContain(token(creation)); });
  it('revokes a pending invitation and makes its token unusable', async () => { const creation = await created(); const revoked = await subject.revoke(creation.id); expect(revoked.status).toBe(ProviderInvitationStatus.REVOKED); await expect(subject.inspect(token(creation))).rejects.toBeInstanceOf(NotFoundException); });
  it('inspects a valid token with masked email and rejects invalid/expired tokens', async () => { const creation = await created(); await expect(subject.inspect(token(creation))).resolves.toMatchObject({ providerDisplayName: provider.displayName, invitedEmail: 'p******@example.com' }); await expect(subject.inspect('x'.repeat(43))).rejects.toBeInstanceOf(NotFoundException); invitationRows[0].expiresAt = new Date(Date.now() - 1); await expect(subject.inspect(token(creation))).rejects.toMatchObject({ status: 410 }); });

  it('accepts once, creates a securely hashed provider user, links it, and preserves provider data', async () => { const creation = await created(); const result = await subject.accept(token(creation), { displayName: 'Ada Provider', password: 'very-secure-password' }); expect(result).toEqual({ providerDisplayName: provider.displayName, email: 'provider@example.com', status: ProviderInvitationStatus.ACCEPTED, loginRequired: true }); const account = userRows.find((row) => row.emailNormalized === 'provider@example.com'); expect(account.roles).toEqual([UserRole.PROVIDER]); expect(account.status).toBe(UserStatus.ACTIVE); expect(provider.userId).toBe(account.id); expect(invitationRows[0]).toMatchObject({ status: ProviderInvitationStatus.ACCEPTED, acceptedAt: expect.any(Date) }); expect(await bcrypt.compare('very-secure-password', credentialRows[0].passwordHash)).toBe(true); expect(provider.services).toEqual([{ id: 'capability-preserved' }]); expect(result).not.toHaveProperty('accessToken'); });
  it('rejects token replay and uses pessimistic locks to prevent double acceptance', async () => { const creation = await created(); await subject.accept(token(creation), { displayName: 'Ada', password: 'very-secure-password' }); await expect(subject.accept(token(creation), { displayName: 'Ada', password: 'very-secure-password' })).rejects.toBeInstanceOf(NotFoundException); expect(invitations.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } })); });
  it('rejects the existing-account branch without overwriting credentials', async () => { const creation = await created(); userRows.push({ id: 'existing', emailNormalized: 'provider@example.com', roles: [UserRole.USER], status: UserStatus.ACTIVE }); await expect(subject.accept(token(creation), { displayName: 'Takeover', password: 'very-secure-password' })).rejects.toBeInstanceOf(ConflictException); expect(credentials.save).not.toHaveBeenCalled(); expect(provider.userId).toBeNull(); });
});
