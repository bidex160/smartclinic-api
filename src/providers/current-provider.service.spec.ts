import { ForbiddenException } from '@nestjs/common';
import { User } from '../users/entities/user.entity';
import { CurrentProviderService } from './current-provider.service';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';

describe('CurrentProviderService', () => {
  const user = { id: '10000000-0000-4000-8000-000000000001' } as User;
  it('resolves the active provider linked to the authenticated user', async () => { const provider = { id: 'provider', userId: user.id, status: ProviderStatus.ACTIVE, deletedAt: null }; const repository = { findOne: jest.fn().mockResolvedValue(provider) }; await expect(new CurrentProviderService(repository as never).resolve(user)).resolves.toBe(provider); expect(repository.findOne).toHaveBeenCalledWith({ where: { userId: user.id }, withDeleted: true }); });
  it('rejects a missing provider link', async () => { const service = new CurrentProviderService({ findOne: jest.fn().mockResolvedValue(null) } as never); await expect(service.resolve(user)).rejects.toBeInstanceOf(ForbiddenException); });
  it.each([ProviderStatus.PENDING, ProviderStatus.SUSPENDED, ProviderStatus.INACTIVE])('rejects a %s provider', async (status) => { const service = new CurrentProviderService({ findOne: jest.fn().mockResolvedValue({ status, deletedAt: null }) } as never); await expect(service.resolve(user)).rejects.toBeInstanceOf(ForbiddenException); });
  it('rejects a deleted provider', async () => { const service = new CurrentProviderService({ findOne: jest.fn().mockResolvedValue({ status: ProviderStatus.ACTIVE, deletedAt: new Date() }) } as never); await expect(service.resolve(user)).rejects.toBeInstanceOf(ForbiddenException); });
  it('resolves an explicitly operational ACTIVE + APPROVED provider', async () => { const provider = { status: ProviderStatus.ACTIVE, onboardingStatus: ProviderOnboardingStatus.APPROVED, deletedAt: null }; const service = new CurrentProviderService({ findOne: jest.fn().mockResolvedValue(provider) } as never); await expect(service.resolveOperational(user)).resolves.toBe(provider); });
  it.each([ProviderOnboardingStatus.DRAFT, ProviderOnboardingStatus.SUBMITTED, ProviderOnboardingStatus.REJECTED])('rejects ACTIVE but %s provider as non-operational', async (onboardingStatus) => { const service = new CurrentProviderService({ findOne: jest.fn().mockResolvedValue({ status: ProviderStatus.ACTIVE, onboardingStatus, deletedAt: null }) } as never); await expect(service.resolveOperational(user)).rejects.toBeInstanceOf(ForbiddenException); });
});

describe('CurrentProviderService staff members', () => {
  const staff = { id: 'staff-user' } as User;
  const provider = { id: 'provider-1', status: ProviderStatus.ACTIVE, onboardingStatus: ProviderOnboardingStatus.APPROVED, deletedAt: null };

  it('resolves an active staff member to their facility with their role', async () => {
    const members = { findOne: jest.fn().mockResolvedValue({ id: 'member-1', role: 'LAB_SCIENTIST', provider }) };
    const service = new CurrentProviderService({ findOne: jest.fn().mockResolvedValue(null) } as never, members as never);
    await expect(service.resolveOperationalActor(staff)).resolves.toEqual({ provider, isOwner: false, role: 'LAB_SCIENTIST', memberId: 'member-1' });
    await expect(service.resolveOperational(staff)).resolves.toBe(provider);
    expect(members.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'staff-user', status: 'ACTIVE' } }));
  });

  it('prefers the owner link and rejects staff of an inactive facility', async () => {
    const owned = { ...provider, id: 'owned' };
    const owner = new CurrentProviderService({ findOne: jest.fn().mockResolvedValue(owned) } as never, { findOne: jest.fn() } as never);
    await expect(owner.resolveActor(staff)).resolves.toMatchObject({ isOwner: true, role: null });
    const suspended = new CurrentProviderService({ findOne: jest.fn().mockResolvedValue(null) } as never, { findOne: jest.fn().mockResolvedValue({ id: 'm', role: 'DOCTOR', provider: { ...provider, status: ProviderStatus.SUSPENDED } }) } as never);
    await expect(suspended.resolveActor(staff)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
