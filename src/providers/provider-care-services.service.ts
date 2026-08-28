import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CareServiceDefinition } from './entities/care-service-definition.entity';
import { ProviderCareService } from './entities/provider-care-service.entity';
import { Provider } from './entities/provider.entity';
import { CreateCareServiceDefinitionDto, CreateProviderCareServiceDto, UpdateCareServiceDefinitionDto, UpdateProviderCareServiceDto } from './dto/care-service.dto';
import { CurrentProviderService } from './current-provider.service';
import { CareDeliveryMode } from './enums/care-delivery-mode.enum';

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
    return this.services.find({ where: { providerId }, relations: { definition: true }, order: { createdAt: 'ASC' } });
  }

  async createForProvider(providerId: string, dto: CreateProviderCareServiceDto) {
    await this.requireProvider(providerId);
    const definition = await this.definitions.findOne({ where: { id: dto.careServiceDefinitionId, isActive: true } });
    if (!definition) throw new ConflictException('Care service definition is not active');
    if (await this.services.exists({ where: { providerId, careServiceDefinitionId: definition.id } })) throw new ConflictException('Provider already offers this care service');
    this.validatePrice(dto.priceMinor, dto.currency);
    this.validateFastTrack(dto.supportsFastTrack ?? false, dto.fastTrackFeeMinor, dto.fastTrackCurrency);
    const deliveryModes = this.validateDeliveryModes(dto.deliveryModes ?? [CareDeliveryMode.IN_PERSON]);
    const entity = this.services.create({ providerId, careServiceDefinitionId: definition.id, descriptionOverride: dto.description ?? null, priceMinor: dto.priceMinor == null ? null : String(dto.priceMinor), currency: dto.priceMinor == null ? null : dto.currency!, supportsAppointmentRequests: dto.supportsAppointmentRequests ?? true, deliveryModes, supportsFastTrack: dto.supportsFastTrack ?? false, fastTrackFeeMinor: dto.supportsFastTrack ? String(dto.fastTrackFeeMinor) : null, fastTrackCurrency: dto.supportsFastTrack ? dto.fastTrackCurrency! : null, isActive: true });
    return this.services.save(entity);
  }

  async updateForProvider(providerId: string, id: string, dto: UpdateProviderCareServiceDto) {
    const service = await this.owned(providerId, id);
    const nextPrice = dto.priceMinor !== undefined ? dto.priceMinor : service.priceMinor == null ? null : Number(service.priceMinor);
    const nextCurrency = dto.currency !== undefined ? dto.currency : service.currency;
    this.validatePrice(nextPrice, nextCurrency);
    const nextFastTrack = dto.supportsFastTrack ?? service.supportsFastTrack;
    const nextFastTrackFee = nextFastTrack ? (dto.fastTrackFeeMinor !== undefined ? dto.fastTrackFeeMinor : service.fastTrackFeeMinor == null ? null : Number(service.fastTrackFeeMinor)) : null;
    const nextFastTrackCurrency = nextFastTrack ? (dto.fastTrackCurrency !== undefined ? dto.fastTrackCurrency : service.fastTrackCurrency) : null;
    this.validateFastTrack(nextFastTrack, nextFastTrackFee, nextFastTrackCurrency);
    if (dto.description !== undefined) service.descriptionOverride = dto.description;
    if (dto.priceMinor !== undefined) service.priceMinor = dto.priceMinor == null ? null : String(dto.priceMinor);
    if (dto.currency !== undefined || dto.priceMinor === null) service.currency = nextPrice == null ? null : nextCurrency;
    if (dto.supportsAppointmentRequests !== undefined) service.supportsAppointmentRequests = dto.supportsAppointmentRequests;
    if (dto.deliveryModes !== undefined) service.deliveryModes = this.validateDeliveryModes(dto.deliveryModes);
    service.supportsFastTrack = nextFastTrack;
    service.fastTrackFeeMinor = nextFastTrack ? String(nextFastTrackFee) : null;
    service.fastTrackCurrency = nextFastTrack ? nextFastTrackCurrency : null;
    return this.services.save(service);
  }

  async setActive(providerId: string, id: string, active: boolean) {
    const service = await this.owned(providerId, id);
    if (active && !await this.definitions.exists({ where: { id: service.careServiceDefinitionId, isActive: true } })) throw new ConflictException('Care service definition is not active');
    service.isActive = active;
    return this.services.save(service);
  }

  private validatePrice(priceMinor: number | null | undefined, currency: string | null | undefined) {
    if (priceMinor == null && currency != null) throw new ConflictException('Currency is only valid with a price');
    if (priceMinor != null && !currency) throw new ConflictException('Currency is required with a price');
  }
  private validateFastTrack(enabled: boolean, feeMinor: number | null | undefined, currency: string | null | undefined) {
    if (!enabled && (feeMinor != null || currency != null)) throw new ConflictException('FastTrack fee is only valid when FastTrack is enabled');
    if (enabled && (!feeMinor || !currency)) throw new ConflictException('FastTrack requires a positive fee and currency');
  }
  private validateDeliveryModes(modes: CareDeliveryMode[]) {
    if (!modes.length || new Set(modes).size !== modes.length || modes.some((mode) => !Object.values(CareDeliveryMode).includes(mode))) throw new ConflictException('At least one unique valid care delivery mode is required');
    return [...modes];
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
