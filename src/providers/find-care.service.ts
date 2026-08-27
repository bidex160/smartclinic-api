import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { CareServiceDefinition } from './entities/care-service-definition.entity';
import { Provider } from './entities/provider.entity';
import { FindCareQueryDto } from './dto/care-service.dto';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';

@Injectable()
export class FindCareService {
  constructor(
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    @InjectRepository(CareServiceDefinition) private readonly definitions: Repository<CareServiceDefinition>,
  ) {}

  async catalogue() {
    const rows = await this.definitions.createQueryBuilder('definition')
      .innerJoin('definition.providerServices', 'service', 'service.isActive = true')
      .innerJoin('service.provider', 'provider', 'provider.status = :active AND provider.onboardingStatus = :approved AND provider.deletedAt IS NULL', { active: ProviderStatus.ACTIVE, approved: ProviderOnboardingStatus.APPROVED })
      .select('definition.code', 'code').addSelect('definition.name', 'name').addSelect('definition.description', 'description').addSelect('COUNT(DISTINCT provider.id)', 'providerCount')
      .where('definition.isActive = true')
      .groupBy('definition.id').addGroupBy('definition.code').addGroupBy('definition.name').addGroupBy('definition.description')
      .orderBy('definition.name', 'ASC').addOrderBy('definition.code', 'ASC')
      .getRawMany<{ code: string; name: string; description: string | null; providerCount: string }>();
    return rows.map((row) => ({ ...row, providerCount: Number(row.providerCount) }));
  }

  async providersList(query: FindCareQueryDto) {
    const builder = this.publicBuilder();
    if (query.q) builder.andWhere(new Brackets((where) => where.where('provider.displayName ILIKE :search', { search: `%${query.q}%` }).orWhere('definition.name ILIKE :search', { search: `%${query.q}%` })));
    if (query.serviceCode) builder.andWhere('definition.code = :serviceCode', { serviceCode: query.serviceCode });
    if (query.providerType) builder.andWhere('provider.providerType = :providerType', { providerType: query.providerType });
    this.applyPlace(builder, query);
    builder.orderBy('provider.displayName', 'ASC').addOrderBy('provider.providerReference', 'ASC').skip((query.page - 1) * query.limit).take(query.limit);
    const [providers, total] = await builder.getManyAndCount();
    return { items: providers.map((provider) => this.mapProvider(provider)), page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0 };
  }

  async providerDetail(reference: string) {
    const provider = await this.publicBuilder().andWhere('provider.providerReference = :reference', { reference }).getOne();
    if (!provider) throw new NotFoundException('Provider was not found');
    return this.mapProvider(provider);
  }

  private publicBuilder() {
    return this.providers.createQueryBuilder('provider').distinct(true)
      .innerJoinAndSelect('provider.careServices', 'careService', 'careService.isActive = true')
      .innerJoinAndSelect('careService.definition', 'definition', 'definition.isActive = true')
      .leftJoinAndSelect('provider.locations', 'location', 'location.isActive = true')
      .where('provider.status = :active', { active: ProviderStatus.ACTIVE })
      .andWhere('provider.onboardingStatus = :approved', { approved: ProviderOnboardingStatus.APPROVED })
      .andWhere('provider.deletedAt IS NULL');
  }

  private applyPlace(builder: SelectQueryBuilder<Provider>, query: FindCareQueryDto) {
    const profile: string[] = []; const location: string[] = []; const parameters: Record<string, string> = {};
    if (query.countryCode) { profile.push('provider.countryCode = :country'); location.push('location.countryCode = :country'); parameters.country = query.countryCode; }
    if (query.stateOrRegion) { profile.push('LOWER(provider.stateOrRegion) = LOWER(:state)'); location.push('LOWER(location.state) = LOWER(:state)'); parameters.state = query.stateOrRegion; }
    if (query.city) { profile.push('LOWER(provider.city) = LOWER(:city)'); location.push('LOWER(location.city) = LOWER(:city)'); parameters.city = query.city; }
    if (profile.length) builder.andWhere(`((${profile.join(' AND ')}) OR (${location.join(' AND ')}))`, parameters);
  }

  private mapProvider(provider: Provider) {
    return {
      providerReference: provider.providerReference,
      displayName: provider.displayName,
      providerType: provider.providerType,
      location: { city: provider.city, stateOrRegion: provider.stateOrRegion, countryCode: provider.countryCode },
      locations: (provider.locations ?? []).filter((location) => location.isActive).map((location) => ({ name: location.name, addressLine1: location.addressLine1, addressLine2: location.addressLine2, city: location.city, stateOrRegion: location.state, postalCode: location.postalCode, countryCode: location.countryCode })),
      services: (provider.careServices ?? []).filter((service) => service.isActive && service.definition?.isActive).map((service) => ({ code: service.definition.code, name: service.definition.name, description: service.descriptionOverride ?? service.definition.description, priceMinor: service.priceMinor == null ? null : Number(service.priceMinor), currency: service.currency, priceOnRequest: service.priceMinor == null, supportsAppointmentRequests: service.supportsAppointmentRequests })),
    };
  }
}
