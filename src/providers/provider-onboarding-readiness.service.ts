import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProviderOnboardingBlocker, ProviderOnboardingReadinessDto } from './dto/provider-onboarding-readiness.dto';
import { ProviderAvailability } from './entities/provider-availability.entity';
import { ProviderLocation } from './entities/provider-location.entity';
import { ProviderService } from './entities/provider-service.entity';
import { Provider } from './entities/provider.entity';
import { PROVIDER_LOCATION_MODE } from './provider-capabilities.service';

@Injectable()
export class ProviderOnboardingReadinessService {
  constructor(
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    @InjectRepository(ProviderService) private readonly services: Repository<ProviderService>,
    @InjectRepository(ProviderLocation) private readonly locations: Repository<ProviderLocation>,
    @InjectRepository(ProviderAvailability) private readonly availability: Repository<ProviderAvailability>,
  ) {}

  async evaluate(providerId: string, manager?: EntityManager): Promise<ProviderOnboardingReadinessDto> {
    const providers = manager?.getRepository(Provider) ?? this.providers;
    const services = manager?.getRepository(ProviderService) ?? this.services;
    const locations = manager?.getRepository(ProviderLocation) ?? this.locations;
    const availability = manager?.getRepository(ProviderAvailability) ?? this.availability;
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
    const blockers: ProviderOnboardingBlocker[] = [];
    if (!profileComplete) blockers.push(ProviderOnboardingBlocker.PROFILE_INCOMPLETE);
    if (!activeCapabilities.length) blockers.push(ProviderOnboardingBlocker.NO_ACTIVE_CAPABILITY);
    if (!providerLocationReady) blockers.push(ProviderOnboardingBlocker.PROVIDER_LOCATION_WITHOUT_LOCATION);
    if (!availabilityCount) blockers.push(ProviderOnboardingBlocker.NO_WEEKLY_AVAILABILITY);
    return { profileComplete, hasActiveCapability: activeCapabilities.length > 0, providerLocationReady, hasAvailability: availabilityCount > 0, blockers, capabilityCount: capabilityRows.length, activeCapabilityCount: activeCapabilities.length, locationCount, activeLocationCount, availabilityCount };
  }
}
