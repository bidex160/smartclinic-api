import { ProviderOnboardingBlocker } from './dto/provider-onboarding-readiness.dto';
import { ProviderOnboardingReadinessService } from './provider-onboarding-readiness.service';

describe('ProviderOnboardingReadinessService', () => {
  const completeProvider = { displayName: 'Clinic', email: 'clinic@example.test', providerType: 'CLINIC', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' };
  const repositories = (provider: any, services: any[], locationCount = 0, activeLocationCount = 0, availabilityCount = 0) => {
    const providers = { findOne: jest.fn().mockResolvedValue(provider) };
    const capabilities = { find: jest.fn().mockResolvedValue(services) };
    const locations = { count: jest.fn().mockResolvedValueOnce(locationCount).mockResolvedValueOnce(activeLocationCount) };
    const availability = { count: jest.fn().mockResolvedValue(availabilityCount) };
    const areas = { find: jest.fn().mockResolvedValue(services.filter((service) => service.fulfilmentMode?.code === 'HOME_VISIT').map((service) => ({ providerServiceId: service.id }))) };
    return new ProviderOnboardingReadinessService(providers as never, capabilities as never, locations as never, availability as never, areas as never);
  };

  it('derives profile, capability, location-link, and availability blockers', async () => {
    const service = repositories({ ...completeProvider, city: null }, [{ isActive: true, fulfilmentMode: { code: 'PROVIDER_LOCATION' }, locationLinks: [] }], 1, 1, 0);
    const result = await service.evaluate('provider-1');
    expect(result.blockers).toEqual([
      ProviderOnboardingBlocker.PROFILE_INCOMPLETE,
      ProviderOnboardingBlocker.PROVIDER_LOCATION_WITHOUT_LOCATION,
      ProviderOnboardingBlocker.NO_WEEKLY_AVAILABILITY,
    ]);
  });

  it('reports a ready provider when active configuration is complete', async () => {
    const service = repositories(completeProvider, [{ isActive: true, fulfilmentMode: { code: 'PROVIDER_LOCATION' }, locationLinks: [{ providerLocation: { isActive: true } }] }], 1, 1, 1);
    await expect(service.evaluate('provider-1')).resolves.toMatchObject({ blockers: [], profileComplete: true, hasActiveCapability: true, providerLocationReady: true, hasAvailability: true });
  });

  it('does not require a physical location for a HOME_VISIT capability', async () => {
    const service = repositories(completeProvider, [{ isActive: true, fulfilmentMode: { code: 'HOME_VISIT' }, locationLinks: [] }], 0, 0, 1);
    await expect(service.evaluate('provider-1')).resolves.toMatchObject({ blockers: [], providerLocationReady: true });
  });
});
