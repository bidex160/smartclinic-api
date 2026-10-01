import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderConfigurationContextService } from './provider-configuration-context.service';

describe('ProviderConfigurationContextService', () => {
  const user: any = { id: 'user-1', status: UserStatus.ACTIVE, roles: [UserRole.PROVIDER], deletedAt: null };

  it('allows a linked pending provider to read and mutate configuration', async () => {
    const provider = { id: 'provider-1', status: ProviderStatus.PENDING, deletedAt: null };
    const service = new ProviderConfigurationContextService({ findOne: jest.fn().mockResolvedValue(provider) } as never);
    await expect(service.resolve(user, true)).resolves.toBe(provider);
  });

  it('allows suspended providers to read but denies mutations', async () => {
    const provider = { id: 'provider-1', status: ProviderStatus.SUSPENDED, deletedAt: null };
    const service = new ProviderConfigurationContextService({ findOne: jest.fn().mockResolvedValue(provider) } as never);
    await expect(service.resolve(user)).resolves.toBe(provider);
    await expect(service.resolve(user, true)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies unlinked, deleted, non-provider, and inactive user contexts', async () => {
    const repository = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new ProviderConfigurationContextService(repository as never);
    await expect(service.resolve(user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.resolve({ ...user, roles: [UserRole.USER] } as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.resolve({ ...user, status: UserStatus.SUSPENDED } as never)).rejects.toBeInstanceOf(ForbiddenException);
    repository.findOne.mockResolvedValue({ status: ProviderStatus.PENDING, deletedAt: new Date() });
    await expect(service.resolve(user)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ProviderConfigurationContextService staff members', () => {
  const staff: any = { id: 'staff-1', status: UserStatus.ACTIVE, roles: [UserRole.USER, UserRole.PROVIDER], deletedAt: null };
  const provider = { id: 'provider-1', status: ProviderStatus.ACTIVE, deletedAt: null };
  const service = (role: string) => new ProviderConfigurationContextService({ findOne: jest.fn().mockResolvedValue(null) } as never, { findOne: jest.fn().mockResolvedValue({ role, provider }) } as never);

  it('lets every staff member read the facility setup', async () => {
    await expect(service('PHARMACIST').resolve(staff)).resolves.toBe(provider);
  });

  it('lets only team admins change it', async () => {
    await expect(service('ADMIN').resolve(staff, true)).resolves.toBe(provider);
    await expect(service('DOCTOR').resolve(staff, true)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
