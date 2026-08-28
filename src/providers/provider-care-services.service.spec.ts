import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProviderCareServicesService } from './provider-care-services.service';
import { CareDeliveryMode } from './enums/care-delivery-mode.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { ProviderCareService } from './entities/provider-care-service.entity';
import { ProviderCareServiceDeliveryOption } from './entities/provider-care-service-delivery-option.entity';
import { CareServiceDefinition } from './entities/care-service-definition.entity';

describe('ProviderCareServicesService', () => {
  const provider = { id: '10000000-0000-4000-8000-000000000001', deletedAt: null, status: ProviderStatus.ACTIVE, onboardingStatus: ProviderOnboardingStatus.APPROVED };
  const definition = { id: '20000000-0000-4000-8000-000000000001', isActive: true };
  const options = [{ deliveryMode: CareDeliveryMode.IN_PERSON, priceMinor: 0, currency: 'NGN' }];
  let definitions: any; let services: any; let optionRepo: any; let providers: any; let current: any; let manager: any; let subject: ProviderCareServicesService;

  beforeEach(() => {
    definitions = { find: jest.fn(), exists: jest.fn().mockResolvedValue(false), create: jest.fn((v) => v), save: jest.fn(async (v) => v) };
    const stored: any = { id: 'service-1', providerId: provider.id, careServiceDefinitionId: definition.id, isActive: true, supportsAppointmentRequests: true, supportsFastTrack: false, fastTrackFeeMinor: null, fastTrackCurrency: null, definition, deliveryOptions: [] };
    services = { find: jest.fn(), exists: jest.fn().mockResolvedValue(false), findOne: jest.fn().mockResolvedValue(stored), findOneOrFail: jest.fn(async () => stored), create: jest.fn((v) => Object.assign(stored, v)), save: jest.fn(async (v) => v) };
    optionRepo = { delete: jest.fn(async () => undefined), create: jest.fn((v) => v), save: jest.fn(async (rows) => { stored.deliveryOptions = rows; return rows; }) };
    const repositories = new Map<any, any>([[CareServiceDefinition, { findOne: jest.fn().mockResolvedValue(definition) }], [ProviderCareService, services], [ProviderCareServiceDeliveryOption, optionRepo]]);
    manager = { getRepository: (entity: any) => repositories.get(entity), transaction: jest.fn(async (fn) => fn(manager)) };
    services.manager = manager;
    providers = { findOne: jest.fn().mockResolvedValue(provider) };
    current = { resolveOperational: jest.fn().mockResolvedValue(provider) };
    subject = new ProviderCareServicesService(definitions, services, providers, current);
  });

  it('creates one or multiple priced delivery options, including explicit free', async () => {
    const result = await subject.createMine({ id: 'user-1' } as any, { careServiceDefinitionId: definition.id, deliveryOptions: options });
    expect(result.deliveryOptions).toEqual([expect.objectContaining({ deliveryMode: CareDeliveryMode.IN_PERSON, priceMinor: '0', currency: 'NGN' })]);
    services.exists.mockResolvedValue(false);
    await subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, deliveryOptions: [{ deliveryMode: CareDeliveryMode.IN_PERSON, priceMinor: 1500000, currency: 'NGN' }, { deliveryMode: CareDeliveryMode.VIRTUAL, priceMinor: 1000000, currency: 'NGN' }] });
    expect(optionRepo.save).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ deliveryMode: CareDeliveryMode.VIRTUAL, priceMinor: '1000000' })]));
  });

  it('rejects empty, duplicate, negative, and invalid-currency options', async () => {
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, deliveryOptions: [] })).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, deliveryOptions: [options[0], options[0]] })).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, deliveryOptions: [{ ...options[0], priceMinor: -1 }] })).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, deliveryOptions: [{ ...options[0], currency: 'ng' }] })).rejects.toBeInstanceOf(ConflictException);
  });

  it('replaces delivery options transactionally on update', async () => {
    await subject.updateForProvider(provider.id, 'service-1', { deliveryOptions: [{ deliveryMode: CareDeliveryMode.VIRTUAL, priceMinor: 1000, currency: 'NGN' }] });
    expect(optionRepo.delete).toHaveBeenCalledWith({ providerCareServiceId: 'service-1' });
    expect(optionRepo.save).toHaveBeenCalledWith([expect.objectContaining({ deliveryMode: CareDeliveryMode.VIRTUAL })]);
  });

  it('prevents duplicate associations and preserves independent FastTrack pricing', async () => {
    services.exists.mockResolvedValueOnce(true);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, deliveryOptions: options })).rejects.toBeInstanceOf(ConflictException);
    services.exists.mockResolvedValue(false);
    await expect(subject.createForProvider(provider.id, { careServiceDefinitionId: definition.id, deliveryOptions: options, supportsFastTrack: true, fastTrackFeeMinor: 500000, fastTrackCurrency: 'NGN' })).resolves.toMatchObject({ supportsFastTrack: true, fastTrackFeeMinor: '500000' });
  });

  it('scopes mutations and enforces operational self-service eligibility', async () => {
    services.findOne.mockResolvedValueOnce(null);
    await expect(subject.updateForProvider('other', 'service-1', {})).rejects.toBeInstanceOf(NotFoundException);
    current.resolveOperational.mockRejectedValue(new ForbiddenException());
    await expect(subject.createMine({ id: 'user-1' } as any, { careServiceDefinitionId: definition.id, deliveryOptions: options })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
