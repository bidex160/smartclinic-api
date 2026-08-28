import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProviderCareServicesService } from './provider-care-services.service';
import { CareDeliveryMode } from './enums/care-delivery-mode.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';

describe('ProviderCareServicesService', () => {
  const provider = { id: '10000000-0000-4000-8000-000000000001', deletedAt: null, status: ProviderStatus.ACTIVE, onboardingStatus: ProviderOnboardingStatus.APPROVED };
  const definition = { id: '20000000-0000-4000-8000-000000000001', code: 'GENERAL_CONSULTATION', name: 'General consultation', isActive: true };
  let definitions: any; let services: any; let providers: any; let current: any; let subject: ProviderCareServicesService;

  beforeEach(() => {
    definitions = { find: jest.fn(), exists: jest.fn().mockResolvedValue(false), findOne: jest.fn().mockResolvedValue(definition), create: jest.fn((v) => v), save: jest.fn(async (v) => v) };
    services = { find: jest.fn().mockResolvedValue([]), exists: jest.fn().mockResolvedValue(false), findOne: jest.fn(), create: jest.fn((v) => ({ id: 'service-1', ...v, definition })), save: jest.fn(async (v) => v) };
    providers = { findOne: jest.fn().mockResolvedValue(provider) };
    current = { resolveOperational: jest.fn().mockResolvedValue(provider) };
    subject = new ProviderCareServicesService(definitions, services, providers, current);
  });

  it('lets an active authenticated provider create its own centrally-defined service', async () => {
    const result = await subject.createMine({ id: 'user-1' } as any, { careServiceDefinitionId: definition.id, priceMinor: 250000, currency: 'NGN', supportsAppointmentRequests: true });
    expect(current.resolveOperational).toHaveBeenCalled();
    expect(result).toMatchObject({ providerId: provider.id, careServiceDefinitionId: definition.id, priceMinor: '250000', currency: 'NGN' });
    expect(result.deliveryModes).toEqual([CareDeliveryMode.IN_PERSON]);
  });

  it('supports one or multiple explicit delivery modes and rejects empty/duplicate configurations', async () => {
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, deliveryModes: [CareDeliveryMode.VIRTUAL] })).resolves.toMatchObject({ deliveryModes: [CareDeliveryMode.VIRTUAL] });
    services.exists.mockResolvedValue(false);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, deliveryModes: [CareDeliveryMode.IN_PERSON, CareDeliveryMode.VIRTUAL] })).resolves.toMatchObject({ deliveryModes: [CareDeliveryMode.IN_PERSON, CareDeliveryMode.VIRTUAL] });
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, deliveryModes: [] })).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, deliveryModes: [CareDeliveryMode.VIRTUAL, CareDeliveryMode.VIRTUAL] })).rejects.toBeInstanceOf(ConflictException);
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

  it('requires a positive server-owned FastTrack fee/currency pair', async () => {
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, supportsFastTrack: true })).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, supportsFastTrack: false, fastTrackFeeMinor: 500000, fastTrackCurrency: 'NGN' })).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, supportsFastTrack: true, fastTrackFeeMinor: 500000, fastTrackCurrency: 'NGN' })).resolves.toMatchObject({ supportsFastTrack: true, fastTrackFeeMinor: '500000', fastTrackCurrency: 'NGN' });
  });

  it('uses provider-scoped lookup so another provider cannot mutate a service', async () => {
    services.findOne.mockResolvedValue(null);
    await expect(subject.updateForProvider('other-provider', 'service-1', { description: 'changed' })).rejects.toBeInstanceOf(NotFoundException);
    expect(services.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'service-1', providerId: 'other-provider' } }));
  });

  it.each(['create', 'update', 'activate', 'deactivate'])('blocks %s self-service mutation when provider is inactive', async (operation) => {
    current.resolveOperational.mockRejectedValue(new ForbiddenException('Active approved provider access is required'));
    const action = operation === 'create' ? subject.createMine({ id: 'user-1' } as any, { careServiceDefinitionId: definition.id })
      : operation === 'update' ? subject.updateMine({ id: 'user-1' } as any, 'service-1', { description: 'Changed' })
        : operation === 'activate' ? subject.activateMine({ id: 'user-1' } as any, 'service-1')
          : subject.deactivateMine({ id: 'user-1' } as any, 'service-1');
    await expect(action).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin support operations but rejects missing providers', async () => {
    providers.findOne.mockResolvedValueOnce(null);
    await expect(subject.listForProvider('missing')).rejects.toBeInstanceOf(NotFoundException);
    providers.findOne.mockResolvedValue(provider);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id })).resolves.toMatchObject({ providerId: provider.id });
  });
});
