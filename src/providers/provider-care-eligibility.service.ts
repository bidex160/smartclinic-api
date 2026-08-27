import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProviderCareService } from './entities/provider-care-service.entity';
import { Provider } from './entities/provider.entity';
import { ProviderLocation } from './entities/provider-location.entity';
import { CareServiceDefinition } from './entities/care-service-definition.entity';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';

export type ProviderCareEligibilityInput = {
  careServiceDefinitionId: string;
  countryCode: string;
  stateOrRegion: string;
  city: string;
  providerReference?: string;
  providerId?: string;
};

@Injectable()
export class ProviderCareEligibilityService {
  constructor(@InjectRepository(ProviderCareService) private readonly services: Repository<ProviderCareService>) {}

  async requireEligible(input: ProviderCareEligibilityInput, manager: EntityManager = this.services.manager): Promise<ProviderCareService> {
    const repository = manager.getRepository(ProviderCareService);
    const builder = repository.createQueryBuilder('service').innerJoin('service.provider', 'provider')
      .where('service.careServiceDefinitionId = :definitionId', { definitionId: input.careServiceDefinitionId });
    if (input.providerReference) builder.andWhere('provider.providerReference = :providerReference', { providerReference: input.providerReference });
    if (input.providerId) builder.andWhere('provider.id = :providerId', { providerId: input.providerId });
    const candidate = await builder.getOne();
    if (!candidate) return this.ineligible();
    const service = await repository.findOne({ where: { id: candidate.id }, lock: { mode: 'pessimistic_write' } });
    if (!service || !service.isActive || !service.supportsAppointmentRequests) return this.ineligible();
    const [provider, definition] = await Promise.all([
      manager.getRepository(Provider).findOne({ where: { id: service.providerId }, withDeleted: true, lock: { mode: 'pessimistic_read' } }),
      manager.getRepository(CareServiceDefinition).findOne({ where: { id: service.careServiceDefinitionId }, lock: { mode: 'pessimistic_read' } }),
    ]);
    if (!provider || provider.deletedAt || provider.status !== ProviderStatus.ACTIVE || provider.onboardingStatus !== ProviderOnboardingStatus.APPROVED || !definition?.isActive) return this.ineligible();
    const profileMatches = provider.countryCode === input.countryCode && provider.stateOrRegion?.toLocaleLowerCase() === input.stateOrRegion.toLocaleLowerCase() && provider.city?.toLocaleLowerCase() === input.city.toLocaleLowerCase();
    const locationMatches = profileMatches ? true : await manager.getRepository(ProviderLocation).createQueryBuilder('location').where('location.providerId = :providerId', { providerId: provider.id }).andWhere('location.isActive = true').andWhere('location.countryCode = :country', { country: input.countryCode }).andWhere('LOWER(location.state) = LOWER(:state)', { state: input.stateOrRegion }).andWhere('LOWER(location.city) = LOWER(:city)', { city: input.city }).getExists();
    if (!locationMatches) return this.ineligible();
    service.provider = provider; service.definition = definition;
    return service;
  }

  private ineligible(): never { throw new ConflictException('Provider is not eligible for the selected care service and location'); }
}
