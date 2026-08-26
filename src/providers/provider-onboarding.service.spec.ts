import { ConflictException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserCredential } from '../users/entities/user-credential.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { Provider } from './entities/provider.entity';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderType } from './enums/provider-type.enum';
import { ProviderOnboardingService } from './provider-onboarding.service';
import { ProviderOnboardingBlocker } from './dto/provider-onboarding-readiness.dto';

describe('ProviderOnboardingService', () => {
  const dto = { displayName: 'Ada Diagnostics', email: 'ADA@Example.test', phone: '+2348000000000', password: 'very-secure-password', professionalReference: 'LAB-1', providerType: ProviderType.DIAGNOSTIC_CENTRE, countryCode: 'ng', stateOrRegion: 'Lagos', city: 'Ikeja' };
  let providerRows: any[], userRows: any[], credentialRows: any[], providers: any, users: any, credentials: any, context: any, readiness: any, referrals: any, subject: ProviderOnboardingService;
  beforeEach(() => {
    providerRows = []; userRows = []; credentialRows = [];
    providers = { exists: jest.fn(async ({ where }: any) => providerRows.some((row) => row.email === where.email)), findOne: jest.fn(async ({ where }: any) => providerRows.find((row) => row.userId === where.userId) ?? null), create: jest.fn((value) => value), save: jest.fn(async (value) => { const saved = { id: value.id ?? 'provider-1', createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...value }; const index = providerRows.findIndex((row) => row.id === saved.id); if (index >= 0) providerRows[index] = saved; else providerRows.push(saved); return saved; }) };
    users = { exists: jest.fn(async ({ where }: any) => userRows.some((row) => row.emailNormalized === where.emailNormalized)), findOne: jest.fn(async ({ where }: any) => userRows.find((row) => row.id === where.id) ?? null), create: jest.fn((value) => value), save: jest.fn(async (value) => { const saved = { id: value.id ?? 'user-1', deletedAt: null, ...value }; userRows.push(saved); return saved; }) };
    credentials = { create: jest.fn((value) => value), save: jest.fn(async (value) => { credentialRows.push(value); return value; }) };
    const manager: any = { getRepository: jest.fn((entity) => entity === Provider ? providers : entity === User ? users : entity === UserCredential ? credentials : {}) };
    manager.transaction = jest.fn(async (work) => work(manager)); providers.manager = manager;
    context = { resolve: jest.fn(async (user) => { const row = providerRows.find((candidate) => candidate.userId === user.id); if (!row) throw new ForbiddenException(); return row; }) };
    readiness = { evaluate: jest.fn(async (providerId) => ({ profileComplete: true, hasActiveCapability: true, providerLocationReady: true, hasAvailability: true, blockers: [], capabilityCount: 1, activeCapabilityCount: 1, locationCount: 1, activeLocationCount: 1, availabilityCount: 1 })) };
    referrals = { ensureReferralCode: jest.fn(), captureProvider: jest.fn() };
    subject = new ProviderOnboardingService(providers, users, credentials, context, readiness, referrals);
  });

  it('self-registers transactionally with a hashed credential, PROVIDER role, and pending draft provider', async () => { const result = await subject.register(dto); expect(result).toMatchObject({ email: 'ada@example.test', status: ProviderStatus.PENDING, onboardingStatus: ProviderOnboardingStatus.DRAFT, providerType: ProviderType.DIAGNOSTIC_CENTRE }); expect(userRows[0]).toMatchObject({ roles: [UserRole.PROVIDER], status: UserStatus.ACTIVE, emailNormalized: 'ada@example.test' }); expect(providerRows[0].userId).toBe(userRows[0].id); expect(await bcrypt.compare(dto.password, credentialRows[0].passwordHash)).toBe(true); expect(result).not.toHaveProperty('passwordHash'); });
  it('rejects duplicate account email', async () => { userRows.push({ emailNormalized: 'ada@example.test' }); await expect(subject.register(dto)).rejects.toBeInstanceOf(ConflictException); });
  it('derives provider referral classification from the persisted provider type', async () => { await subject.register({ ...dto, referralCode: 'SC-AB12CD', intendedReferralType: 'LABORATORY' as any }); expect(referrals.captureProvider).toHaveBeenCalledWith(expect.anything(), 'SC-AB12CD', expect.objectContaining({ providerType: ProviderType.DIAGNOSTIC_CENTRE }), 'LABORATORY'); });
  it('allows a pending provider to view and update only onboarding profile fields', async () => { await subject.register(dto); const user = userRows[0]; await expect(subject.get(user)).resolves.toMatchObject({ displayName: dto.displayName }); const result = await subject.update(user, { city: 'Lagos', countryCode: 'NG' }); expect(result.city).toBe('Lagos'); expect(providerRows[0].status).toBe(ProviderStatus.PENDING); expect(user.roles).toEqual([UserRole.PROVIDER]); });
  it('submits a rejected provider again and clears the prior review result', async () => { await subject.register(dto); const provider = providerRows[0]; provider.onboardingStatus = ProviderOnboardingStatus.REJECTED; provider.reviewNote = 'Fix profile'; provider.reviewedAt = new Date(); provider.reviewedByUserId = 'reviewer'; const result = await subject.submit(userRows[0]); expect(result).toMatchObject({ onboardingStatus: ProviderOnboardingStatus.SUBMITTED, status: ProviderStatus.PENDING, reviewNote: null }); expect(provider.reviewedByUserId).toBeNull(); });
  it('rejects submission with structured readiness blockers and a missing provider link', async () => { await subject.register(dto); readiness.evaluate.mockResolvedValueOnce({ profileComplete: false, hasActiveCapability: true, providerLocationReady: true, hasAvailability: true, blockers: [ProviderOnboardingBlocker.PROFILE_INCOMPLETE], capabilityCount: 1, activeCapabilityCount: 1, locationCount: 1, activeLocationCount: 1, availabilityCount: 1 }); await expect(subject.submit(userRows[0])).rejects.toBeInstanceOf(ConflictException); providerRows = []; await expect(subject.get(userRows[0])).rejects.toBeInstanceOf(ForbiddenException); });
  it('does not allow self-service identity edits after approval', async () => { await subject.register(dto); providerRows[0].onboardingStatus = ProviderOnboardingStatus.APPROVED; providerRows[0].status = ProviderStatus.ACTIVE; await expect(subject.update(userRows[0], { city: 'Abuja' })).rejects.toBeInstanceOf(ConflictException); });
});
