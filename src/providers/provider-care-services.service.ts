import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CareServiceDefinition } from './entities/care-service-definition.entity';
import { ProviderCareService } from './entities/provider-care-service.entity';
import { Provider } from './entities/provider.entity';
import { CreateCareServiceDefinitionDto, CreateProviderCareServiceDto, ProviderCareServiceDeliveryOptionDto, UpdateCareServiceDefinitionDto, UpdateProviderCareServiceDto } from './dto/care-service.dto';
import { CurrentProviderService } from './current-provider.service';
import { ProviderCareServiceDeliveryOption } from './entities/provider-care-service-delivery-option.entity';

@Injectable()
export class ProviderCareServicesService {
  constructor(
    @InjectRepository(CareServiceDefinition) private readonly definitions: Repository<CareServiceDefinition>,
    @InjectRepository(ProviderCareService) private readonly services: Repository<ProviderCareService>,
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    private readonly currentProvider: CurrentProviderService,
  ) {}

  listDefinitions(includeInactive = false) {
    return this.definitions.find({ where: includeInactive ? {} : { isActive: true }, order: { name: 'ASC', code: 'ASC' } });
  }

  async createDefinition(dto: CreateCareServiceDefinitionDto) {
    if (await this.definitions.exists({ where: { code: dto.code } })) throw new ConflictException('Care service code already exists');
    return this.definitions.save(this.definitions.create({ code: dto.code, name: dto.name, description: dto.description ?? null, isActive: true }));
  }

  async updateDefinition(id: string, dto: UpdateCareServiceDefinitionDto) {
    const definition = await this.definitions.findOne({ where: { id } });
    if (!definition) throw new NotFoundException('Care service definition was not found');
    if (dto.code && dto.code !== definition.code && await this.definitions.exists({ where: { code: dto.code } })) throw new ConflictException('Care service code already exists');
    Object.assign(definition, dto);
    return this.definitions.save(definition);
  }

  async listMine(user: User) { const provider = await this.operationalProvider(user); return this.listForProvider(provider.id); }
  async createMine(user: User, dto: CreateProviderCareServiceDto) { const provider = await this.operationalProvider(user); return this.createForProvider(provider.id, dto); }
  async updateMine(user: User, id: string, dto: UpdateProviderCareServiceDto) { const provider = await this.operationalProvider(user); return this.updateForProvider(provider.id, id, dto); }
  async activateMine(user: User, id: string) { const provider = await this.operationalProvider(user); return this.setActive(provider.id, id, true); }
  async deactivateMine(user: User, id: string) { const provider = await this.operationalProvider(user); return this.setActive(provider.id, id, false); }

  async listForProvider(providerId: string) {
    await this.requireProvider(providerId);
    return this.services.find({ where: { providerId }, relations: { definition: true, deliveryOptions: true }, order: { createdAt: 'ASC', deliveryOptions: { deliveryMode: 'ASC' } } });
  }

  async createForProvider(providerId: string, dto: CreateProviderCareServiceDto) {
    await this.requireProvider(providerId);
    this.validateDeliveryOptions(dto.deliveryOptions);
    this.validateFastTrack(dto.supportsFastTrack ?? false, dto.fastTrackFeeMinor, dto.fastTrackCurrency);
    return this.services.manager.transaction(async (manager) => {
      const definition = await manager.getRepository(CareServiceDefinition).findOne({ where: { id: dto.careServiceDefinitionId, isActive: true }, lock: { mode: 'pessimistic_read' } });
      if (!definition) throw new ConflictException('Care service definition is not active');
      if (await manager.getRepository(ProviderCareService).exists({ where: { providerId, careServiceDefinitionId: definition.id } })) throw new ConflictException('Provider already offers this care service');
      const services = manager.getRepository(ProviderCareService);
      const entity = await services.save(services.create({ providerId, careServiceDefinitionId: definition.id, descriptionOverride: dto.description ?? null, supportsAppointmentRequests: dto.supportsAppointmentRequests ?? true, supportsFastTrack: dto.supportsFastTrack ?? false, fastTrackFeeMinor: dto.supportsFastTrack ? String(dto.fastTrackFeeMinor) : null, fastTrackCurrency: dto.supportsFastTrack ? dto.fastTrackCurrency! : null, isActive: true }));
      await this.replaceDeliveryOptions(manager, entity.id, dto.deliveryOptions);
      return this.load(manager, entity.id, providerId);
    });
  }

  async updateForProvider(providerId: string, id: string, dto: UpdateProviderCareServiceDto) {
    if (dto.deliveryOptions !== undefined) this.validateDeliveryOptions(dto.deliveryOptions);
    return this.services.manager.transaction(async (manager) => {
      const service = await manager.getRepository(ProviderCareService).findOne({ where: { id, providerId }, lock: { mode: 'pessimistic_write' } });
      if (!service) throw new NotFoundException('Provider care service was not found');
      const nextFastTrack = dto.supportsFastTrack ?? service.supportsFastTrack;
      const nextFastTrackFee = nextFastTrack ? (dto.fastTrackFeeMinor !== undefined ? dto.fastTrackFeeMinor : service.fastTrackFeeMinor == null ? null : Number(service.fastTrackFeeMinor)) : null;
      const nextFastTrackCurrency = nextFastTrack ? (dto.fastTrackCurrency !== undefined ? dto.fastTrackCurrency : service.fastTrackCurrency) : null;
      this.validateFastTrack(nextFastTrack, nextFastTrackFee, nextFastTrackCurrency);
      if (dto.description !== undefined) service.descriptionOverride = dto.description;
      if (dto.supportsAppointmentRequests !== undefined) service.supportsAppointmentRequests = dto.supportsAppointmentRequests;
      service.supportsFastTrack = nextFastTrack;
      service.fastTrackFeeMinor = nextFastTrack ? String(nextFastTrackFee) : null;
      service.fastTrackCurrency = nextFastTrack ? nextFastTrackCurrency : null;
      await manager.getRepository(ProviderCareService).save(service);
      if (dto.deliveryOptions !== undefined) await this.replaceDeliveryOptions(manager, service.id, dto.deliveryOptions);
      return this.load(manager, service.id, providerId);
    });
  }

  async setActive(providerId: string, id: string, active: boolean) {
    const service = await this.owned(providerId, id);
    if (active && !await this.definitions.exists({ where: { id: service.careServiceDefinitionId, isActive: true } })) throw new ConflictException('Care service definition is not active');
    service.isActive = active;
    return this.services.save(service);
  }

  private validateFastTrack(enabled: boolean, feeMinor: number | null | undefined, currency: string | null | undefined) {
    if (!enabled && (feeMinor != null || currency != null)) throw new ConflictException('FastTrack fee is only valid when FastTrack is enabled');
    if (enabled && (!feeMinor || !currency)) throw new ConflictException('FastTrack requires a positive fee and currency');
  }
  private validateDeliveryOptions(options: ProviderCareServiceDeliveryOptionDto[]) {
    if (!options?.length || new Set(options.map((option) => option.deliveryMode)).size !== options.length) throw new ConflictException('At least one unique care delivery option is required');
    if (options.some((option) => !Number.isSafeInteger(option.priceMinor) || option.priceMinor < 0 || !/^[A-Z]{3}$/.test(option.currency))) throw new ConflictException('Every delivery option requires a valid non-negative minor-unit price and currency');
  }
  private async replaceDeliveryOptions(manager: EntityManager, providerCareServiceId: string, options: ProviderCareServiceDeliveryOptionDto[]) {
    const repository = manager.getRepository(ProviderCareServiceDeliveryOption);
    await repository.delete({ providerCareServiceId });
    await repository.save(options.map((option) => repository.create({ providerCareServiceId, deliveryMode: option.deliveryMode, priceMinor: String(option.priceMinor), currency: option.currency })));
  }
  private load(manager: EntityManager, id: string, providerId: string) {
    return manager.getRepository(ProviderCareService).findOneOrFail({ where: { id, providerId }, relations: { definition: true, deliveryOptions: true }, order: { deliveryOptions: { deliveryMode: 'ASC' } } });
  }
  private async owned(providerId: string, id: string) {
    const service = await this.services.findOne({ where: { id, providerId }, relations: { definition: true } });
    if (!service) throw new NotFoundException('Provider care service was not found');
    return service;
  }
  private async requireProvider(id: string) {
    const provider = await this.providers.findOne({ where: { id }, withDeleted: true });
    if (!provider || provider.deletedAt) throw new NotFoundException('Provider was not found');
    return provider;
  }
  private async operationalProvider(user: User) {
    return this.currentProvider.resolveOperational(user);
  }
}
