import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProviderOnboardingBlocker, ProviderOnboardingReadinessDto } from './dto/provider-onboarding-readiness.dto';
import { ProviderAvailability } from './entities/provider-availability.entity';
import { ProviderLocation } from './entities/provider-location.entity';
import { ProviderService } from './entities/provider-service.entity';
import { Provider } from './entities/provider.entity';
import { PROVIDER_LOCATION_MODE } from './provider-capabilities.service';
import { ProviderServiceArea } from './entities/provider-service-area.entity';

@Injectable()
export class ProviderOnboardingReadinessService {
  constructor(
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    @InjectRepository(ProviderService) private readonly services: Repository<ProviderService>,
    @InjectRepository(ProviderLocation) private readonly locations: Repository<ProviderLocation>,
    @InjectRepository(ProviderAvailability) private readonly availability: Repository<ProviderAvailability>,
    @InjectRepository(ProviderServiceArea) private readonly serviceAreas: Repository<ProviderServiceArea>,
  ) {}

  async evaluate(providerId: string, manager?: EntityManager): Promise<ProviderOnboardingReadinessDto> {
    const providers = manager?.getRepository(Provider) ?? this.providers;
    const services = manager?.getRepository(ProviderService) ?? this.services;
    const locations = manager?.getRepository(ProviderLocation) ?? this.locations;
    const availability = manager?.getRepository(ProviderAvailability) ?? this.availability;
    const serviceAreas = manager?.getRepository(ProviderServiceArea) ?? this.serviceAreas;
    const provider = await providers.findOne({ where: { id: providerId }, withDeleted: true });
    const capabilityRows = await services.find({ where: { providerId }, relations: { fulfilmentMode: true, locationLinks: { providerLocation: true } } });
    const [locationCount, activeLocationCount, availabilityCount] = await Promise.all([
      locations.count({ where: { providerId } }),
      locations.count({ where: { providerId, isActive: true } }),
      availability.count({ where: { providerId, isActive: true } }),
    ]);
    const activeCapabilities = capabilityRows.filter((service) => service.isActive);
    const profileComplete = !!provider && [provider.displayName, provider.email, provider.providerType, provider.countryCode, provider.stateOrRegion, provider.city].every(Boolean);
    const providerLocationReady = activeCapabilities.filter((service) => service.fulfilmentMode?.code === PROVIDER_LOCATION_MODE).every((service) => service.locationLinks?.some((link) => link.providerLocation?.isActive));
    const homeVisitCapabilities = activeCapabilities.filter((service) => service.fulfilmentMode?.code === 'HOME_VISIT');
    const coveredHomeVisitServiceIds = homeVisitCapabilities.length ? new Set((await serviceAreas.find({ where: { providerId, isActive: true } })).map((area) => area.providerServiceId)) : new Set<string>();
    const homeVisitReady = homeVisitCapabilities.every((service) => coveredHomeVisitServiceIds.has(service.id));
    const blockers: ProviderOnboardingBlocker[] = [];
    if (!profileComplete) blockers.push(ProviderOnboardingBlocker.PROFILE_INCOMPLETE);
    if (!activeCapabilities.length) blockers.push(ProviderOnboardingBlocker.NO_ACTIVE_CAPABILITY);
    if (!providerLocationReady) blockers.push(ProviderOnboardingBlocker.PROVIDER_LOCATION_WITHOUT_LOCATION);
    if (!availabilityCount) blockers.push(ProviderOnboardingBlocker.NO_WEEKLY_AVAILABILITY);
    if (!homeVisitReady) blockers.push(ProviderOnboardingBlocker.HOME_VISIT_WITHOUT_SERVICE_AREA);
    return { profileComplete, hasActiveCapability: activeCapabilities.length > 0, providerLocationReady, homeVisitReady, hasAvailability: availabilityCount > 0, blockers, capabilityCount: capabilityRows.length, activeCapabilityCount: activeCapabilities.length, locationCount, activeLocationCount, availabilityCount };
  }
}
