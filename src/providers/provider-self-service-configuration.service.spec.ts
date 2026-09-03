import { NotFoundException } from '@nestjs/common';
import { ProviderSelfServiceConfigurationService } from './provider-self-service-configuration.service';

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
    context = { resolve: jest.fn().mockResolvedValue({ id: 'provider-1' }) };
    capabilities = Object.fromEntries(['listServices', 'createService', 'activateService', 'deactivateService', 'listLocations', 'createLocation', 'getLocation', 'updateLocation', 'activateLocation', 'deactivateLocation', 'linkLocation', 'unlinkLocation'].map((name) => [name, jest.fn().mockResolvedValue({ id: 'result' })]));
    weekly = Object.fromEntries(['list', 'create', 'get', 'update', 'activate', 'deactivate'].map((name) => [name, jest.fn().mockResolvedValue({ id: 'result' })]));
    exceptionsService = Object.fromEntries(['list', 'create', 'get', 'update', 'activate', 'deactivate'].map((name) => [name, jest.fn().mockResolvedValue({ id: 'result' })]));
    services = { findOne: jest.fn().mockResolvedValue({ id: 'service-1', providerId: 'provider-1' }) };
    locations = { findOne: jest.fn().mockResolvedValue({ id: 'location-1', providerId: 'provider-1' }) };
    availability = { findOne: jest.fn().mockResolvedValue({ id: 'availability-1', providerId: 'provider-1' }) };
    exceptions = { findOne: jest.fn().mockResolvedValue({ id: 'exception-1', providerId: 'provider-1' }) };
    serviceAddons = { find: jest.fn(), findOne: jest.fn().mockResolvedValue(null), create: jest.fn((value) => value), save: jest.fn(async (value) => value), createQueryBuilder: jest.fn() };
    clinicalContents = { findOne: jest.fn().mockResolvedValue({ id: 'content-1', code: 'CHOLESTEROL', name: 'Cholesterol', category: 'LAB', isActive: true }) };
    packageAddons = { exists: jest.fn().mockResolvedValue(true) };
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
});
