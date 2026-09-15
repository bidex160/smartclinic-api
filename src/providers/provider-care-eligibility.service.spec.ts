import { ConflictException } from '@nestjs/common';
import { ProviderCareEligibilityService } from './provider-care-eligibility.service';
import { ProviderCareService } from './entities/provider-care-service.entity';
import { Provider } from './entities/provider.entity';
import { CareServiceDefinition } from './entities/care-service-definition.entity';
import { ProviderLocation } from './entities/provider-location.entity';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { CareDeliveryMode } from './enums/care-delivery-mode.enum';
import { ProviderCareServiceDeliveryOption } from './entities/provider-care-service-delivery-option.entity';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { CareRequestStatus } from '../care-requests/enums/care-request-status.enum';

describe('ProviderCareEligibilityService', () => {
  const input = { careServiceDefinitionId: 'definition', providerReference: 'SCPR-ABCDEF0123456789', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', deliveryMode: CareDeliveryMode.IN_PERSON };
  let offering: any; let selectedOption: any; let provider: any; let definition: any; let candidateQb: any; let locationQb: any; let workloadQb: any; let serviceRepository: any; let optionRepository: any; let careRequestRepository: any; let manager: any; let subject: ProviderCareEligibilityService;
  beforeEach(() => {
    offering = { id: 'offering', providerId: 'provider', careServiceDefinitionId: 'definition', isActive: true, supportsAppointmentRequests: true, createdAt: new Date('2026-01-01T00:00:00Z'), deliveryOptions: [{ deliveryMode: CareDeliveryMode.IN_PERSON, priceMinor: '1500', currency: 'NGN' }, { deliveryMode: CareDeliveryMode.VIRTUAL, priceMinor: '1000', currency: 'NGN' }] };
    selectedOption = offering.deliveryOptions[0];
    provider = { id: 'provider', providerReference: input.providerReference, status: ProviderStatus.ACTIVE, onboardingStatus: ProviderOnboardingStatus.APPROVED, deletedAt: null, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' };
    definition = { id: 'definition', isActive: true };
    candidateQb = {}; for (const method of ['innerJoin', 'where', 'andWhere', 'orderBy']) candidateQb[method] = jest.fn().mockReturnValue(candidateQb); candidateQb.getOne = jest.fn().mockResolvedValue(offering); candidateQb.getMany = jest.fn().mockResolvedValue([offering]);
    locationQb = {}; for (const method of ['select', 'where', 'andWhere']) locationQb[method] = jest.fn().mockReturnValue(locationQb); locationQb.getExists = jest.fn().mockResolvedValue(true); locationQb.getQuery = jest.fn().mockReturnValue('SELECT 1');
    workloadQb = {}; for (const method of ['select', 'addSelect', 'where', 'andWhere', 'groupBy']) workloadQb[method] = jest.fn().mockReturnValue(workloadQb); workloadQb.getRawMany = jest.fn().mockResolvedValue([]);
    serviceRepository = { createQueryBuilder: jest.fn().mockReturnValue(candidateQb), findOne: jest.fn().mockResolvedValue(offering), find: jest.fn().mockResolvedValue([offering]) };
    optionRepository = { findOne: jest.fn().mockImplementation(async ({ where }: any) => where.deliveryMode === selectedOption?.deliveryMode ? selectedOption : null) };
    careRequestRepository = { createQueryBuilder: jest.fn().mockReturnValue(workloadQb) };
    const repositories = new Map<any, any>([
      [ProviderCareService, serviceRepository], [ProviderCareServiceDeliveryOption, optionRepository],
      [Provider, { findOne: jest.fn().mockResolvedValue(provider) }], [CareServiceDefinition, { findOne: jest.fn().mockResolvedValue(definition) }],
      [ProviderLocation, { createQueryBuilder: jest.fn().mockReturnValue(locationQb) }],
      [CareRequest, careRequestRepository],
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
  it('locks the offering and selected delivery option separately', async () => { await expect(subject.requireEligible(input, manager)).resolves.toMatchObject({ selectedDeliveryOption: { priceMinor: '1500', currency: 'NGN' } }); expect(serviceRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } })); expect(serviceRepository.findOne.mock.calls[0][0]).not.toHaveProperty('relations'); expect(optionRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { providerCareServiceId: 'offering', deliveryMode: CareDeliveryMode.IN_PERSON }, lock: { mode: 'pessimistic_read' } })); });
  it('returns the selected delivery price and rejects an unsupported mode', async () => { await expect(subject.requireEligible(input, manager)).resolves.toMatchObject({ selectedDeliveryOption: { priceMinor: '1500', currency: 'NGN' } }); selectedOption = null; await expect(subject.requireEligible(input, manager)).rejects.toBeInstanceOf(ConflictException); });
  it('rejects a provider without the selected service', async () => { candidateQb.getOne.mockResolvedValue(null); await expect(subject.requireEligible(input, manager)).rejects.toBeInstanceOf(ConflictException); });
  it('requires coherent authoritative geography', async () => { provider.city = 'Lekki'; locationQb.getExists.mockResolvedValue(false); await expect(subject.requireEligible(input, manager)).rejects.toBeInstanceOf(ConflictException); });
  it('accepts one coherent active ProviderLocation when optional profile geography does not match', async () => { provider.countryCode = null; provider.stateOrRegion = null; provider.city = null; locationQb.getExists.mockResolvedValue(true); await expect(subject.requireEligible(input, manager)).resolves.toMatchObject({ id: 'offering' }); expect(locationQb.getExists).toHaveBeenCalled(); });
  it('does not require an optional ProviderLocation when coherent profile geography matches', async () => { await expect(subject.requireEligible(input, manager)).resolves.toMatchObject({ id: 'offering' }); expect(locationQb.getExists).not.toHaveBeenCalled(); });
  it('authorizes a preferred VIRTUAL provider by service and delivery option without physical geography', async () => { selectedOption = offering.deliveryOptions[1]; const virtual = { ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }; provider.countryCode = 'GH'; provider.stateOrRegion = 'Greater Accra'; provider.city = 'Accra'; await expect(subject.requireEligible(virtual, manager)).resolves.toMatchObject({ selectedDeliveryOption: { deliveryMode: CareDeliveryMode.VIRTUAL, priceMinor: '1000' } }); expect(locationQb.getExists).not.toHaveBeenCalled(); });
  it('authorizes a virtual-only provider with no Health Check capability or location', async () => { selectedOption = offering.deliveryOptions[1]; const virtual = { ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }; provider.healthCheckServices = []; provider.locations = []; await expect(subject.requireEligible(virtual, manager)).resolves.toMatchObject({ providerId: 'provider', selectedDeliveryOption: { deliveryMode: CareDeliveryMode.VIRTUAL } }); expect(locationQb.getExists).not.toHaveBeenCalled(); });
  it('does not authorize a preferred provider without the requested VIRTUAL offering', async () => { selectedOption = null; await expect(subject.requireEligible({ ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }, manager)).rejects.toBeInstanceOf(ConflictException); });
  it('automatically selects the earliest service when eligible provider workload is equal', async () => {
    const early = { ...offering, id: 'service-a', providerId: 'provider-a', createdAt: new Date('2026-01-01T00:00:00Z') };
    const later = { ...offering, id: 'service-b', providerId: 'provider-b', createdAt: new Date('2026-01-02T00:00:00Z') };
    candidateQb.getMany.mockResolvedValue([later, early]);
    serviceRepository.find.mockResolvedValue([early, later]);
    const requireEligible = jest.spyOn(subject, 'requireEligible').mockImplementation(async ({ providerId }: any) => Object.assign(providerId === 'provider-a' ? early : later, { selectedDeliveryOption: selectedOption }));

    await expect(subject.findEligibleCareProvider({ ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }, manager)).resolves.toMatchObject({ providerId: 'provider-a' });

    expect(candidateQb.orderBy).toHaveBeenCalledWith('service.id', 'ASC');
    expect(serviceRepository.find).toHaveBeenCalledWith(expect.objectContaining({ order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' } }));
    expect(requireEligible).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'provider-a' }), manager);
  });
  it('automatically prefers the provider with the lowest active care-request workload', async () => {
    const busy = { ...offering, id: 'service-a', providerId: 'provider-a', createdAt: new Date('2026-01-01T00:00:00Z') };
    const available = { ...offering, id: 'service-b', providerId: 'provider-b', createdAt: new Date('2026-01-02T00:00:00Z') };
    candidateQb.getMany.mockResolvedValue([busy, available]);
    serviceRepository.find.mockResolvedValue([busy, available]);
    workloadQb.getRawMany.mockResolvedValue([{ providerId: 'provider-a', activeWorkload: '1' }]);
    jest.spyOn(subject, 'requireEligible').mockImplementation(async ({ providerId }: any) => Object.assign(providerId === 'provider-a' ? busy : available, { selectedDeliveryOption: selectedOption }));

    await expect(subject.findEligibleCareProvider({ ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }, manager)).resolves.toMatchObject({ providerId: 'provider-b' });
  });
  it('uses the deterministic service tie-break when non-zero workload is equal', async () => {
    const early = { ...offering, id: 'service-a', providerId: 'provider-a', createdAt: new Date('2026-01-01T00:00:00Z') };
    const later = { ...offering, id: 'service-b', providerId: 'provider-b', createdAt: new Date('2026-01-02T00:00:00Z') };
    candidateQb.getMany.mockResolvedValue([later, early]);
    serviceRepository.find.mockResolvedValue([early, later]);
    workloadQb.getRawMany.mockResolvedValue([{ providerId: 'provider-a', activeWorkload: '1' }, { providerId: 'provider-b', activeWorkload: '1' }]);
    jest.spyOn(subject, 'requireEligible').mockImplementation(async ({ providerId }: any) => Object.assign(providerId === 'provider-a' ? early : later, { selectedDeliveryOption: selectedOption }));

    await expect(subject.findEligibleCareProvider({ ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }, manager)).resolves.toMatchObject({ providerId: 'provider-a' });
  });
  it('counts only the configured active care-request statuses as provider workload', async () => {
    jest.spyOn(subject, 'requireEligible').mockResolvedValue(Object.assign(offering, { selectedDeliveryOption: selectedOption }));

    await subject.findEligibleCareProvider({ ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }, manager);

    expect(workloadQb.andWhere).toHaveBeenCalledWith('request.status IN (:...statuses)', {
      statuses: [
        CareRequestStatus.PROVIDER_SELECTED,
        CareRequestStatus.AWAITING_PROVIDER_RESPONSE,
        CareRequestStatus.PROVIDER_ACCEPTED,
        CareRequestStatus.SCHEDULED,
        CareRequestStatus.IN_PROGRESS,
      ],
    });
  });
  it('does not count declined or terminal requests that still retain assigned provider IDs', async () => {
    const early = { ...offering, id: 'service-a', providerId: 'provider-a', createdAt: new Date('2026-01-01T00:00:00Z') };
    const later = { ...offering, id: 'service-b', providerId: 'provider-b', createdAt: new Date('2026-01-02T00:00:00Z') };
    candidateQb.getMany.mockResolvedValue([early, later]);
    serviceRepository.find.mockResolvedValue([early, later]);
    workloadQb.getRawMany.mockResolvedValue([{ providerId: 'provider-b', activeWorkload: '1' }]);
    jest.spyOn(subject, 'requireEligible').mockImplementation(async ({ providerId }: any) => Object.assign(providerId === 'provider-a' ? early : later, { selectedDeliveryOption: selectedOption }));

    await expect(subject.findEligibleCareProvider({ ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }, manager)).resolves.toMatchObject({ providerId: 'provider-a' });
  });
  it('keeps VIRTUAL automatic matching independent of geography, ProviderLocation and Health Check configuration', async () => {
    selectedOption = offering.deliveryOptions[1];
    provider.healthCheckServices = [];
    provider.locations = [];
    jest.spyOn(subject, 'requireEligible').mockResolvedValue(Object.assign(offering, { selectedDeliveryOption: selectedOption }));

    await expect(subject.findEligibleCareProvider({ ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }, manager)).resolves.toMatchObject({ providerId: 'provider' });
    expect(locationQb.getExists).not.toHaveBeenCalled();
  });
  it('preserves IN_PERSON location filtering before automatic workload ranking', async () => {
    jest.spyOn(subject, 'requireEligible').mockResolvedValue(Object.assign(offering, { selectedDeliveryOption: selectedOption }));
    await subject.findEligibleCareProvider(input, manager);
    expect(locationQb.getQuery).toHaveBeenCalled();
    expect(candidateQb.andWhere).toHaveBeenCalledWith(expect.stringContaining('EXISTS'), expect.objectContaining({ countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' }));
  });
  it('tries the next automatic candidate when the best-ranked candidate becomes ineligible', async () => {
    const first = { ...offering, id: 'service-a', providerId: 'provider-a', createdAt: new Date('2026-01-01T00:00:00Z') };
    const second = { ...offering, id: 'service-b', providerId: 'provider-b', createdAt: new Date('2026-01-02T00:00:00Z') };
    candidateQb.getMany.mockResolvedValue([first, second]);
    serviceRepository.find.mockResolvedValue([first, second]);
    const requireEligible = jest.spyOn(subject, 'requireEligible').mockRejectedValueOnce(new ConflictException()).mockResolvedValueOnce(Object.assign(second, { selectedDeliveryOption: selectedOption }));

    await expect(subject.findEligibleCareProvider({ ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }, manager)).resolves.toMatchObject({ providerId: 'provider-b' });
    expect(requireEligible).toHaveBeenNthCalledWith(1, expect.objectContaining({ providerId: 'provider-a' }), manager);
    expect(requireEligible).toHaveBeenNthCalledWith(2, expect.objectContaining({ providerId: 'provider-b' }), manager);
  });
  it('returns null when every automatic candidate becomes ineligible', async () => {
    const first = { ...offering, id: 'service-a', providerId: 'provider-a', createdAt: new Date('2026-01-01T00:00:00Z') };
    const second = { ...offering, id: 'service-b', providerId: 'provider-b', createdAt: new Date('2026-01-02T00:00:00Z') };
    candidateQb.getMany.mockResolvedValue([first, second]);
    serviceRepository.find.mockResolvedValue([first, second]);
    jest.spyOn(subject, 'requireEligible').mockRejectedValue(new ConflictException());

    await expect(subject.findEligibleCareProvider({ ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }, manager)).resolves.toBeNull();
  });
  it('propagates non-eligibility errors during automatic candidate revalidation', async () => {
    jest.spyOn(subject, 'requireEligible').mockRejectedValue(new Error('database unavailable'));
    await expect(subject.findEligibleCareProvider({ ...input, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: null, stateOrRegion: null, city: null }, manager)).rejects.toThrow('database unavailable');
  });
});
