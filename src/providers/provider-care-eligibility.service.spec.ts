import { ConflictException } from '@nestjs/common';
import { ProviderCareEligibilityService } from './provider-care-eligibility.service';
import { ProviderCareService } from './entities/provider-care-service.entity';
import { Provider } from './entities/provider.entity';
import { CareServiceDefinition } from './entities/care-service-definition.entity';
import { ProviderLocation } from './entities/provider-location.entity';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { CareDeliveryMode } from './enums/care-delivery-mode.enum';

describe('ProviderCareEligibilityService', () => {
  const input = { careServiceDefinitionId: 'definition', providerReference: 'SCPR-ABCDEF0123456789', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', deliveryMode: CareDeliveryMode.VIRTUAL };
  let offering: any; let provider: any; let definition: any; let candidateQb: any; let locationQb: any; let manager: any; let subject: ProviderCareEligibilityService;
  beforeEach(() => {
    offering = { id: 'offering', providerId: 'provider', careServiceDefinitionId: 'definition', isActive: true, supportsAppointmentRequests: true, deliveryModes: [CareDeliveryMode.IN_PERSON, CareDeliveryMode.VIRTUAL] };
    provider = { id: 'provider', providerReference: input.providerReference, status: ProviderStatus.ACTIVE, onboardingStatus: ProviderOnboardingStatus.APPROVED, deletedAt: null, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' };
    definition = { id: 'definition', isActive: true };
    candidateQb = {}; for (const method of ['innerJoin', 'where', 'andWhere']) candidateQb[method] = jest.fn().mockReturnValue(candidateQb); candidateQb.getOne = jest.fn().mockResolvedValue(offering);
    locationQb = {}; for (const method of ['where', 'andWhere']) locationQb[method] = jest.fn().mockReturnValue(locationQb); locationQb.getExists = jest.fn().mockResolvedValue(true);
    const repositories = new Map<any, any>([
      [ProviderCareService, { createQueryBuilder: jest.fn().mockReturnValue(candidateQb), findOne: jest.fn().mockResolvedValue(offering) }],
      [Provider, { findOne: jest.fn().mockResolvedValue(provider) }], [CareServiceDefinition, { findOne: jest.fn().mockResolvedValue(definition) }],
      [ProviderLocation, { createQueryBuilder: jest.fn().mockReturnValue(locationQb) }],
    ]);
    manager = { getRepository: (entity: any) => repositories.get(entity) };
    subject = new ProviderCareEligibilityService({ manager } as any);
  });
  it('returns the exact active approved provider offering', async () => { await expect(subject.requireEligible(input, manager)).resolves.toMatchObject({ id: 'offering', providerId: 'provider' }); });
  it.each([
    ['inactive offering', () => offering.isActive = false], ['appointment requests disabled', () => offering.supportsAppointmentRequests = false],
    ['inactive provider', () => provider.status = ProviderStatus.INACTIVE], ['unapproved provider', () => provider.onboardingStatus = ProviderOnboardingStatus.SUBMITTED],
    ['deleted provider', () => provider.deletedAt = new Date()], ['inactive definition', () => definition.isActive = false],
  ])('rejects %s', async (_label, mutate) => { mutate(); await expect(subject.requireEligible(input, manager)).rejects.toBeInstanceOf(ConflictException); });
  it('rejects an offering that does not support the requested delivery mode', async () => { offering.deliveryModes = [CareDeliveryMode.IN_PERSON]; await expect(subject.requireEligible(input, manager)).rejects.toBeInstanceOf(ConflictException); });
  it('rejects a provider without the selected service', async () => { candidateQb.getOne.mockResolvedValue(null); await expect(subject.requireEligible(input, manager)).rejects.toBeInstanceOf(ConflictException); });
  it('requires coherent authoritative geography', async () => { provider.city = 'Lekki'; locationQb.getExists.mockResolvedValue(false); await expect(subject.requireEligible(input, manager)).rejects.toBeInstanceOf(ConflictException); });
});
