import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProviderCareServicesService } from './provider-care-services.service';

describe('ProviderCareServicesService', () => {
  const provider = { id: '10000000-0000-4000-8000-000000000001', deletedAt: null, onboardingStatus: 'APPROVED' };
  const definition = { id: '20000000-0000-4000-8000-000000000001', code: 'GENERAL_CONSULTATION', name: 'General consultation', isActive: true };
  let definitions: any; let services: any; let providers: any; let current: any; let subject: ProviderCareServicesService;

  beforeEach(() => {
    definitions = { find: jest.fn(), exists: jest.fn().mockResolvedValue(false), findOne: jest.fn().mockResolvedValue(definition), create: jest.fn((v) => v), save: jest.fn(async (v) => v) };
    services = { find: jest.fn().mockResolvedValue([]), exists: jest.fn().mockResolvedValue(false), findOne: jest.fn(), create: jest.fn((v) => ({ id: 'service-1', ...v, definition })), save: jest.fn(async (v) => v) };
    providers = { findOne: jest.fn().mockResolvedValue(provider) };
    current = { resolve: jest.fn().mockResolvedValue(provider) };
    subject = new ProviderCareServicesService(definitions, services, providers, current);
  });

  it('lets an active authenticated provider create its own centrally-defined service', async () => {
    const result = await subject.createMine({ id: 'user-1' } as any, { careServiceDefinitionId: definition.id, priceMinor: 250000, currency: 'NGN', supportsAppointmentRequests: true });
    expect(current.resolve).toHaveBeenCalled();
    expect(result).toMatchObject({ providerId: provider.id, careServiceDefinitionId: definition.id, priceMinor: '250000', currency: 'NGN' });
  });

  it('prevents duplicate provider/catalogue associations', async () => {
    services.exists.mockResolvedValue(true);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id })).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces price/currency pairing and supports price on request', async () => {
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, priceMinor: 1000 })).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, currency: 'NGN' })).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id })).resolves.toMatchObject({ priceMinor: null, currency: null });
  });

  it('uses provider-scoped lookup so another provider cannot mutate a service', async () => {
    services.findOne.mockResolvedValue(null);
    await expect(subject.updateForProvider('other-provider', 'service-1', { description: 'changed' })).rejects.toBeInstanceOf(NotFoundException);
    expect(services.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'service-1', providerId: 'other-provider' } }));
  });

  it('allows admin support operations but rejects missing providers', async () => {
    providers.findOne.mockResolvedValueOnce(null);
    await expect(subject.listForProvider('missing')).rejects.toBeInstanceOf(NotFoundException);
    providers.findOne.mockResolvedValue(provider);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id })).resolves.toMatchObject({ providerId: provider.id });
  });
});
