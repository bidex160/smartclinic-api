import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { AdminProvidersService } from './admin-providers.service';
import { CurrentProviderService } from './current-provider.service';
import { ProviderAssignment } from './entities/provider-assignment.entity';
import { ProviderBookingReservation } from './entities/provider-booking-reservation.entity';
import { Provider } from './entities/provider.entity';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderType } from './enums/provider-type.enum';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';

describe('AdminProvidersService', () => {
  const creatorId = '30000000-0000-4000-8000-000000000001';
  let provider: any, user: any, providers: any, users: any, assignments: any, reservations: any, capabilities: any, locations: any, readiness: any, subject: AdminProvidersService;
  beforeEach(() => {
    user = { id: '20000000-0000-4000-8000-000000000001', email: 'provider@example.test', displayName: 'Provider User', status: UserStatus.ACTIVE, roles: [UserRole.USER], deletedAt: null };
    provider = { id: '10000000-0000-4000-8000-000000000001', displayName: 'SmartClinic Ikeja', email: 'provider@example.test', phone: null, professionalReference: null, providerType: ProviderType.CLINIC, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', status: ProviderStatus.PENDING, onboardingStatus: ProviderOnboardingStatus.SUBMITTED, submittedAt: new Date(), reviewedAt: null, reviewedByUserId: null, reviewNote: null, userId: null, user: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
    providers = { findOne: jest.fn(async () => provider), create: jest.fn((value) => ({ id: provider.id, createdAt: new Date(), updatedAt: new Date(), user: null, ...value })), save: jest.fn(async (value) => { provider = value; provider.user = provider.userId === user.id ? user : null; return provider; }), exists: jest.fn().mockResolvedValue(false) };
    users = { findOne: jest.fn(async () => user), save: jest.fn(async (value) => { user = value; return user; }) };
    assignments = { exists: jest.fn().mockResolvedValue(false) }; reservations = { exists: jest.fn().mockResolvedValue(false) };
    capabilities = { countBy: jest.fn().mockResolvedValue(2) }; locations = { countBy: jest.fn().mockResolvedValue(3) };
    readiness = { evaluate: jest.fn().mockResolvedValue({ profileComplete: true, hasActiveCapability: true, providerLocationReady: true, hasAvailability: true, blockers: [], capabilityCount: 2, activeCapabilityCount: 1, locationCount: 3, activeLocationCount: 2, availabilityCount: 1 }) };
    const manager: any = { getRepository: jest.fn((entity) => entity === Provider ? providers : entity.name === 'User' ? users : entity === ProviderAssignment ? assignments : entity === ProviderBookingReservation ? reservations : {}) };
    manager.transaction = jest.fn(async (work) => work(manager)); providers.manager = manager;
    subject = new AdminProvidersService(providers, users, assignments, reservations, capabilities, locations, readiness);
  });

  it('gets a safe detail with capability and location counts', async () => { const result: any = await subject.get(provider.id); expect(result).toMatchObject({ id: provider.id, capabilityCount: 2, locationCount: 3 }); expect(result).not.toHaveProperty('deletedAt'); expect(result).not.toHaveProperty('credential'); });
  it('returns 404 for an unknown provider', async () => { providers.findOne.mockResolvedValue(null); await expect(subject.get(provider.id)).rejects.toBeInstanceOf(NotFoundException); });
  it('updates only basic profile fields', async () => { const result = await subject.update(provider.id, { displayName: 'Updated', professionalReference: 'REF-1' }); expect(result).toMatchObject({ displayName: 'Updated', professionalReference: 'REF-1' }); expect(provider.userId).toBeNull(); });
  it('approves submitted onboarding and activates, then permits operational suspension/reactivation', async () => { provider.userId = user.id; user.roles = [UserRole.PROVIDER]; expect(await subject.approve(provider.id, creatorId)).toMatchObject({ status: ProviderStatus.ACTIVE, onboardingStatus: ProviderOnboardingStatus.APPROVED }); expect((await subject.suspend(provider.id)).status).toBe(ProviderStatus.SUSPENDED); expect((await subject.activate(provider.id)).status).toBe(ProviderStatus.ACTIVE); });
  it('rejects approval when provider configuration readiness has blockers', async () => { provider.userId = user.id; user.roles = [UserRole.PROVIDER]; readiness.evaluate.mockResolvedValueOnce({ blockers: ['NO_WEEKLY_AVAILABILITY'] }); await expect(subject.approve(provider.id, creatorId)).rejects.toBeInstanceOf(ConflictException); expect(provider.status).toBe(ProviderStatus.PENDING); });
  it('rejects submitted onboarding without deleting the account', async () => { provider.userId = user.id; const result = await subject.reject(provider.id, creatorId, 'Profile needs correction'); expect(result).toMatchObject({ status: ProviderStatus.PENDING, onboardingStatus: ProviderOnboardingStatus.REJECTED, reviewNote: 'Profile needs correction' }); expect(provider.userId).toBe(user.id); });
  it('does not activate unapproved onboarding', async () => { await expect(subject.activate(provider.id)).rejects.toBeInstanceOf(ConflictException); });

  it('links an active existing user and grants PROVIDER without duplicating roles', async () => { user.roles = [UserRole.ADMIN, UserRole.OPERATIONS, UserRole.PROVIDER]; const result = await subject.linkUser(provider.id, user.id); expect(result.linkedUser?.id).toBe(user.id); expect(user.roles).toEqual([UserRole.ADMIN, UserRole.OPERATIONS, UserRole.PROVIDER]); expect(provider.userId).toBe(user.id); expect(capabilities.countBy).toHaveBeenCalled(); });
  it('adds PROVIDER while preserving USER', async () => { await subject.linkUser(provider.id, user.id); expect(user.roles).toEqual([UserRole.USER, UserRole.PROVIDER]); });
  it('rejects a provider already linked, including duplicate linking', async () => { provider.userId = user.id; await expect(subject.linkUser(provider.id, user.id)).rejects.toBeInstanceOf(ConflictException); });
  it('rejects a user linked to another provider', async () => { providers.exists.mockResolvedValue(true); await expect(subject.linkUser(provider.id, user.id)).rejects.toBeInstanceOf(ConflictException); });
  it.each([UserStatus.SUSPENDED, UserStatus.DEACTIVATED, UserStatus.INVITED])('rejects an ineligible %s user', async (status) => { user.status = status; await expect(subject.linkUser(provider.id, user.id)).rejects.toBeInstanceOf(ConflictException); });
  it('rejects a deleted user', async () => { user.deletedAt = new Date(); await expect(subject.linkUser(provider.id, user.id)).rejects.toBeInstanceOf(ConflictException); });

  it('unlinks transactionally, removes only PROVIDER, and preserves provider capabilities', async () => { provider.userId = user.id; provider.user = user; user.roles = [UserRole.ADMIN, UserRole.PROVIDER]; const result = await subject.unlinkUser(provider.id); expect(provider.userId).toBeNull(); expect(user.roles).toEqual([UserRole.ADMIN]); expect(result.capabilityCount).toBe(2); expect(capabilities.countBy).toHaveBeenCalledWith({ providerId: provider.id }); });
  it('blocks unlinking while an active assignment exists', async () => { provider.userId = user.id; assignments.exists.mockResolvedValue(true); await expect(subject.unlinkUser(provider.id)).rejects.toBeInstanceOf(ConflictException); expect(provider.userId).toBe(user.id); });
  it('blocks unlinking while active reserved capacity exists', async () => { provider.userId = user.id; reservations.exists.mockResolvedValue(true); await expect(subject.unlinkUser(provider.id)).rejects.toBeInstanceOf(ConflictException); });

  it('remains compatible with active provider resolution, suspension, and unlinking', async () => { await subject.linkUser(provider.id, user.id); user.roles = [UserRole.PROVIDER]; await subject.approve(provider.id, creatorId); const current = new CurrentProviderService({ findOne: jest.fn(async ({ where }: any) => provider.userId === where.userId ? provider : null) } as never); await expect(current.resolve(user)).resolves.toBe(provider); await subject.suspend(provider.id); await expect(current.resolve(user)).rejects.toBeInstanceOf(ForbiddenException); provider.status = ProviderStatus.ACTIVE; await subject.unlinkUser(provider.id); await expect(current.resolve(user)).rejects.toBeInstanceOf(ForbiddenException); });

  it('lists providers with filters and pagination in safe shape', async () => { provider.user = user; const builder: any = { leftJoinAndSelect: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getManyAndCount: jest.fn().mockResolvedValue([[provider], 1]) }; providers.createQueryBuilder = jest.fn().mockReturnValue(builder); const result = await subject.list({ status: ProviderStatus.ACTIVE, linkedUserId: user.id, search: 'Ikeja', page: 1, limit: 25 }); expect(result).toMatchObject({ total: 1, page: 1, limit: 25 }); expect(result.items[0].linkedUser).toEqual({ id: user.id, email: user.email, displayName: user.displayName, roles: user.roles, status: user.status }); expect(builder.andWhere).toHaveBeenCalledTimes(3); });
});
