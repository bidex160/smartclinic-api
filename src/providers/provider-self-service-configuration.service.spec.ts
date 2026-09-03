import { NotFoundException } from '@nestjs/common';
import { ProviderSelfServiceConfigurationService } from './provider-self-service-configuration.service';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderType } from './enums/provider-type.enum';
import { HealthCheckClinicalResultType } from '../health-checks/enums/health-check-clinical-result-type.enum';
import { ProviderServiceAddonConfigurationUnavailableReason } from './enums/provider-service-addon-configuration-unavailable-reason.enum';

describe('ProviderSelfServiceConfigurationService', () => {
  const user = { id: 'user-1' } as never;
  let context: any;
  let capabilities: any;
  let weekly: any;
  let exceptionsService: any;
  let services: any;
  let locations: any;
  let availability: any;
  let exceptions: any;
  let serviceAddons: any;
  let clinicalContents: any;
  let packageAddons: any;
  let subject: ProviderSelfServiceConfigurationService;

  beforeEach(() => {
    context = { resolve: jest.fn().mockResolvedValue({ id: 'provider-1', status: ProviderStatus.ACTIVE, providerType: ProviderType.CLINIC }) };
    capabilities = Object.fromEntries(['listServices', 'createService', 'activateService', 'deactivateService', 'listLocations', 'createLocation', 'getLocation', 'updateLocation', 'activateLocation', 'deactivateLocation', 'linkLocation', 'unlinkLocation'].map((name) => [name, jest.fn().mockResolvedValue({ id: 'result' })]));
    weekly = Object.fromEntries(['list', 'create', 'get', 'update', 'activate', 'deactivate'].map((name) => [name, jest.fn().mockResolvedValue({ id: 'result' })]));
    exceptionsService = Object.fromEntries(['list', 'create', 'get', 'update', 'activate', 'deactivate'].map((name) => [name, jest.fn().mockResolvedValue({ id: 'result' })]));
    services = { findOne: jest.fn().mockResolvedValue({ id: 'service-1', providerId: 'provider-1', healthCheckPackageId: 'package-1', currency: 'NGN', isActive: true }) };
    locations = { findOne: jest.fn().mockResolvedValue({ id: 'location-1', providerId: 'provider-1' }) };
    availability = { findOne: jest.fn().mockResolvedValue({ id: 'availability-1', providerId: 'provider-1' }) };
    exceptions = { findOne: jest.fn().mockResolvedValue({ id: 'exception-1', providerId: 'provider-1' }) };
    serviceAddons = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null), create: jest.fn((value) => value), save: jest.fn(async (value) => value), delete: jest.fn(), createQueryBuilder: jest.fn() };
    clinicalContents = { findOne: jest.fn().mockResolvedValue({ id: 'content-1', code: 'CHOLESTEROL', name: 'Cholesterol', description: 'Lipid measurement', category: 'LAB', resultType: HealthCheckClinicalResultType.SINGLE_NUMERIC, unit: 'mg/dL', displayOrder: 1, isActive: true }) };
    packageAddons = { exists: jest.fn().mockResolvedValue(true), find: jest.fn().mockResolvedValue([]) };
    subject = new ProviderSelfServiceConfigurationService(context, capabilities, weekly, exceptionsService, services, locations, availability, exceptions, {} as never, serviceAddons, clinicalContents, packageAddons);
  });

  it('derives provider identity for capability creation and activation', async () => {
    await subject.createService(user, { healthCheckPackageId: 'package-1', fulfilmentModeId: 'mode-1', priceMinor: 4500000, currency: 'NGN' });
    await subject.activateService(user, 'service-1');
    expect(capabilities.createService).toHaveBeenCalledWith('provider-1', expect.any(Object));
    expect(services.findOne).toHaveBeenCalledWith({ where: { id: 'service-1', providerId: 'provider-1' } });
  });

  it('links and unlinks only owned service/location records', async () => {
    await subject.linkLocation(user, 'service-1', 'location-1');
    await subject.unlinkLocation(user, 'service-1', 'location-1');
    expect(capabilities.linkLocation).toHaveBeenCalledWith('service-1', 'location-1');
    expect(capabilities.unlinkLocation).toHaveBeenCalledWith('service-1', 'location-1');
  });

  it('delegates owned location, availability, and exception mutations', async () => {
    await subject.updateLocation(user, 'location-1', { city: 'Lagos' });
    await subject.activateAvailability(user, 'availability-1');
    await subject.deactivateException(user, 'exception-1');
    expect(capabilities.updateLocation).toHaveBeenCalled();
    expect(weekly.activate).toHaveBeenCalledWith('availability-1');
    expect(exceptionsService.deactivate).toHaveBeenCalledWith('exception-1');
  });

  it('returns a safe not-found response for cross-provider records', async () => {
    services.findOne.mockResolvedValue(null);
    await expect(subject.activateService(user, 'other-service')).rejects.toBeInstanceOf(NotFoundException);
    expect(capabilities.activateService).not.toHaveBeenCalled();
  });

  it('prices only canonical content approved for the offered package', async () => {
    services.findOne.mockResolvedValue({ id: 'service-1', providerId: 'provider-1', healthCheckPackageId: 'package-1', currency: 'NGN' });

    await expect(subject.configureServiceAddon(user, 'service-1', { addonCode: 'CHOLESTEROL', priceMinor: 150000, currency: 'NGN' })).resolves.toMatchObject({ code: 'CHOLESTEROL', priceMinor: 150000 });
    expect(packageAddons.exists).toHaveBeenCalledWith({ where: { healthCheckPackageId: 'package-1', clinicalContentId: 'content-1', isActive: true } });
    expect(serviceAddons.create).toHaveBeenCalledWith(expect.objectContaining({ providerServiceId: 'service-1', clinicalContentId: 'content-1' }));

    packageAddons.exists.mockResolvedValue(false);
    await expect(subject.configureServiceAddon(user, 'service-1', { addonCode: 'CHOLESTEROL', priceMinor: 150000, currency: 'NGN' })).rejects.toThrow('Clinical add-on is incompatible with this package');
  });

  it('returns active eligible but unconfigured canonical add-ons with offering null', async () => {
    const clinicalContent = await clinicalContents.findOne(); packageAddons.find.mockResolvedValue([{ clinicalContentId: 'content-1', isActive: true, clinicalContent }]);
    await expect(subject.listServiceAddons(user, 'service-1')).resolves.toEqual({ providerServiceId: 'service-1', currency: 'NGN', items: [expect.objectContaining({ code: 'CHOLESTEROL', description: 'Lipid measurement', resultType: HealthCheckClinicalResultType.SINGLE_NUMERIC, unit: 'mg/dL', canonicalActive: true, eligibilityActive: true, canConfigure: true, configurationUnavailableReason: null, offering: null })] });
  });

  it('unions configured and eligible rows once and includes provider price, currency, active state, and zero', async () => {
    const clinicalContent = await clinicalContents.findOne(); packageAddons.find.mockResolvedValue([{ clinicalContentId: 'content-1', isActive: true, clinicalContent }]); serviceAddons.find.mockResolvedValue([{ clinicalContentId: 'content-1', priceMinor: '0', currency: 'NGN', isActive: false, clinicalContent }]);
    const result = await subject.listServiceAddons(user, 'service-1');
    expect(result.items).toHaveLength(1); expect(result.items[0].offering).toEqual({ priceMinor: 0, currency: 'NGN', isActive: false });
  });

  it('keeps configured content visible when canonical content is inactive', async () => {
    const clinicalContent = { ...(await clinicalContents.findOne()), isActive: false }; packageAddons.find.mockResolvedValue([{ clinicalContentId: 'content-1', isActive: true, clinicalContent }]); serviceAddons.find.mockResolvedValue([{ clinicalContentId: 'content-1', priceMinor: '500000', currency: 'NGN', isActive: true, clinicalContent }]);
    await expect(subject.listServiceAddons(user, 'service-1')).resolves.toMatchObject({ items: [{ canonicalActive: false, eligibilityActive: true, canConfigure: false, configurationUnavailableReason: ProviderServiceAddonConfigurationUnavailableReason.CANONICAL_CONTENT_INACTIVE, offering: { priceMinor: 500000 } }] });
  });

  it('keeps configured content visible when package eligibility is inactive or absent', async () => {
    const clinicalContent = await clinicalContents.findOne(); packageAddons.find.mockResolvedValue([{ clinicalContentId: 'content-1', isActive: false, clinicalContent }]); serviceAddons.find.mockResolvedValue([{ clinicalContentId: 'content-1', priceMinor: '500000', currency: 'NGN', isActive: true, clinicalContent }]);
    await expect(subject.listServiceAddons(user, 'service-1')).resolves.toMatchObject({ items: [{ eligibilityActive: false, canConfigure: false, configurationUnavailableReason: ProviderServiceAddonConfigurationUnavailableReason.PACKAGE_ELIGIBILITY_INACTIVE, offering: { priceMinor: 500000 } }] });
    packageAddons.find.mockResolvedValue([]); const absent = await subject.listServiceAddons(user, 'service-1'); expect(absent.items[0].configurationUnavailableReason).toBe(ProviderServiceAddonConfigurationUnavailableReason.PACKAGE_ELIGIBILITY_INACTIVE);
  });

  it('marks retained configuration non-configurable when provider mutation status is disabled, without treating an inactive service as a blocker', async () => {
    const clinicalContent = await clinicalContents.findOne(); packageAddons.find.mockResolvedValue([{ clinicalContentId: 'content-1', isActive: true, clinicalContent }]);
    context.resolve.mockResolvedValue({ id: 'provider-1', status: ProviderStatus.SUSPENDED });
    expect((await subject.listServiceAddons(user, 'service-1')).items[0]).toMatchObject({ canConfigure: false, configurationUnavailableReason: ProviderServiceAddonConfigurationUnavailableReason.PROVIDER_CONFIGURATION_DISABLED });
    context.resolve.mockResolvedValue({ id: 'provider-1', status: ProviderStatus.ACTIVE }); services.findOne.mockResolvedValue({ id: 'service-1', providerId: 'provider-1', healthCheckPackageId: 'package-1', currency: 'NGN', isActive: false });
    expect((await subject.listServiceAddons(user, 'service-1')).items[0]).toMatchObject({ canConfigure: true, configurationUnavailableReason: null });
  });

  it('scopes both candidate and offering reads to the owned ProviderService and its package', async () => {
    await subject.listServiceAddons(user, 'service-1');
    expect(services.findOne).toHaveBeenCalledWith({ where: { id: 'service-1', providerId: 'provider-1' } });
    expect(packageAddons.find).toHaveBeenCalledWith({ where: { healthCheckPackageId: 'package-1' }, relations: { clinicalContent: true } });
    expect(serviceAddons.find).toHaveBeenCalledWith({ where: { providerServiceId: 'service-1' }, relations: { clinicalContent: true } });
    services.findOne.mockResolvedValue(null); await expect(subject.listServiceAddons(user, 'other-service')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps prices independent between ProviderServices through service-scoped reads', async () => {
    const clinicalContent = await clinicalContents.findOne(); serviceAddons.find.mockImplementation(async ({ where }: any) => [{ clinicalContentId: 'content-1', priceMinor: where.providerServiceId === 'service-1' ? '100' : '200', currency: 'NGN', isActive: true, clinicalContent }]);
    services.findOne.mockImplementation(async ({ where }: any) => ({ id: where.id, providerId: 'provider-1', healthCheckPackageId: 'package-1', currency: 'NGN', isActive: true }));
    expect((await subject.listServiceAddons(user, 'service-1')).items[0].offering?.priceMinor).toBe(100);
    expect((await subject.listServiceAddons(user, 'service-2')).items[0].offering?.priceMinor).toBe(200);
  });

  it('POST updates and reactivates the retained offering without creating a duplicate', async () => {
    services.findOne.mockResolvedValue({ id: 'service-1', providerId: 'provider-1', healthCheckPackageId: 'package-1', currency: 'NGN' }); const retained: any = { providerServiceId: 'service-1', clinicalContentId: 'content-1', priceMinor: '10', currency: 'NGN', isActive: false }; serviceAddons.findOne.mockResolvedValue(retained);
    await subject.configureServiceAddon(user, 'service-1', { addonCode: 'CHOLESTEROL', priceMinor: 0, currency: 'NGN' });
    expect(serviceAddons.create).not.toHaveBeenCalled(); expect(serviceAddons.save).toHaveBeenCalledWith(expect.objectContaining({ priceMinor: '0', currency: 'NGN', isActive: true }));
  });

  it('POST retains inactive/ineligible and currency mismatch protections', async () => {
    services.findOne.mockResolvedValue({ id: 'service-1', providerId: 'provider-1', healthCheckPackageId: 'package-1', currency: 'NGN' });
    clinicalContents.findOne.mockResolvedValue(null); await expect(subject.configureServiceAddon(user, 'service-1', { addonCode: 'CHOLESTEROL', priceMinor: 1, currency: 'NGN' })).rejects.toThrow('Clinical add-on is unavailable');
    clinicalContents.findOne.mockResolvedValue({ id: 'content-1', code: 'CHOLESTEROL', isActive: true }); packageAddons.exists.mockResolvedValue(false); await expect(subject.configureServiceAddon(user, 'service-1', { addonCode: 'CHOLESTEROL', priceMinor: 1, currency: 'NGN' })).rejects.toThrow('incompatible');
    packageAddons.exists.mockResolvedValue(true); await expect(subject.configureServiceAddon(user, 'service-1', { addonCode: 'CHOLESTEROL', priceMinor: 1, currency: 'USD' })).rejects.toThrow('currency');
  });

  it('DELETE remains a soft deactivation and the inactive offering remains readable', async () => {
    const clinicalContent = await clinicalContents.findOne(); const retained: any = { clinicalContentId: 'content-1', priceMinor: '500', currency: 'NGN', isActive: true, clinicalContent };
    const builder: any = { innerJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(retained) }; serviceAddons.createQueryBuilder.mockReturnValue(builder);
    await subject.disableServiceAddon(user, 'service-1', 'CHOLESTEROL'); expect(retained.isActive).toBe(false); expect(serviceAddons.save).toHaveBeenCalledWith(retained); expect(serviceAddons.delete).not.toHaveBeenCalled();
    serviceAddons.find.mockResolvedValue([retained]); const result = await subject.listServiceAddons(user, 'service-1'); expect(result.items[0].offering?.isActive).toBe(false);
  });

  it('uses the same ProviderService path for HOSPITAL without type branching', async () => {
    context.resolve.mockResolvedValue({ id: 'provider-1', status: ProviderStatus.ACTIVE, providerType: ProviderType.HOSPITAL }); const clinicalContent = await clinicalContents.findOne(); packageAddons.find.mockResolvedValue([{ clinicalContentId: 'content-1', isActive: true, clinicalContent }]);
    await expect(subject.listServiceAddons(user, 'service-1')).resolves.toMatchObject({ items: [{ canConfigure: true }] });
  });
});
