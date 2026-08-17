import { ForbiddenException } from '@nestjs/common';
import { User } from '../users/entities/user.entity';
import { CurrentProviderService } from './current-provider.service';
import { ProviderStatus } from './enums/provider-status.enum';

describe('CurrentProviderService', () => {
  const user = { id: '10000000-0000-4000-8000-000000000001' } as User;
  it('resolves the active provider linked to the authenticated user', async () => { const provider = { id: 'provider', userId: user.id, status: ProviderStatus.ACTIVE, deletedAt: null }; const repository = { findOne: jest.fn().mockResolvedValue(provider) }; await expect(new CurrentProviderService(repository as never).resolve(user)).resolves.toBe(provider); expect(repository.findOne).toHaveBeenCalledWith({ where: { userId: user.id }, withDeleted: true }); });
  it('rejects a missing provider link', async () => { const service = new CurrentProviderService({ findOne: jest.fn().mockResolvedValue(null) } as never); await expect(service.resolve(user)).rejects.toBeInstanceOf(ForbiddenException); });
  it.each([ProviderStatus.PENDING, ProviderStatus.SUSPENDED, ProviderStatus.INACTIVE])('rejects a %s provider', async (status) => { const service = new CurrentProviderService({ findOne: jest.fn().mockResolvedValue({ status, deletedAt: null }) } as never); await expect(service.resolve(user)).rejects.toBeInstanceOf(ForbiddenException); });
  it('rejects a deleted provider', async () => { const service = new CurrentProviderService({ findOne: jest.fn().mockResolvedValue({ status: ProviderStatus.ACTIVE, deletedAt: new Date() }) } as never); await expect(service.resolve(user)).rejects.toBeInstanceOf(ForbiddenException); });
});
