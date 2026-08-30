import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CareServiceDefinition } from './entities/care-service-definition.entity';
import { ProviderCareService } from './entities/provider-care-service.entity';
import { Provider } from './entities/provider.entity';
import { CreateCareServiceDefinitionDto, CreateProviderCareServiceDto, ProviderCareServiceDeliveryOptionDto, SaveProviderClinicalTemplateDto, UpdateCareServiceDefinitionDto, UpdateProviderCareServiceDto } from './dto/care-service.dto';
import { ProviderConfigurationContextService } from './provider-configuration-context.service';
import { ProviderCareServiceDeliveryOption } from './entities/provider-care-service-delivery-option.entity';
import { ProviderCareServiceClinicalTemplate } from './entities/provider-care-service-clinical-template.entity';
import { ClinicalDocumentationTemplateMode, genericTemplate, isTemplateDrivenType, validateCustomTemplate } from '../clinical-records/clinical-documentation-template';
import { ClinicalRecordType } from '../clinical-records/enums/clinical-record-type.enum';

@Injectable()
export class ProviderCareServicesService {
  constructor(
    @InjectRepository(CareServiceDefinition) private readonly definitions: Repository<CareServiceDefinition>,
    @InjectRepository(ProviderCareService) private readonly services: Repository<ProviderCareService>,
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    private readonly configurationContext: ProviderConfigurationContextService,
  ) {}

  listDefinitions(includeInactive = false) {
    return this.definitions.find({ where: includeInactive ? {} : { isActive: true }, order: { name: 'ASC', code: 'ASC' } });
  }

  async createDefinition(dto: CreateCareServiceDefinitionDto) {
    if (await this.definitions.exists({ where: { code: dto.code } })) throw new ConflictException('Care service code already exists');
    return this.definitions.save(this.definitions.create({ code: dto.code, name: dto.name, description: dto.description ?? null, clinicalRecordType: dto.clinicalRecordType ?? null, isActive: true }));
  }

  async updateDefinition(id: string, dto: UpdateCareServiceDefinitionDto) {
    const definition = await this.definitions.findOne({ where: { id } });
    if (!definition) throw new NotFoundException('Care service definition was not found');
    if (dto.code && dto.code !== definition.code && await this.definitions.exists({ where: { code: dto.code } })) throw new ConflictException('Care service code already exists');
    Object.assign(definition, dto);
    return this.definitions.save(definition);
  }

  async listMine(user: User) { const provider = await this.configurationProvider(user); return this.listForProvider(provider.id); }
  async createMine(user: User, dto: CreateProviderCareServiceDto) { const provider = await this.configurationProvider(user, true); return this.createForProvider(provider.id, dto); }
  async updateMine(user: User, id: string, dto: UpdateProviderCareServiceDto) { const provider = await this.configurationProvider(user, true); return this.updateForProvider(provider.id, id, dto); }
  async activateMine(user: User, id: string) { const provider = await this.configurationProvider(user, true); return this.setActive(provider.id, id, true); }
  async deactivateMine(user: User, id: string) { const provider = await this.configurationProvider(user, true); return this.setActive(provider.id, id, false); }
  async getClinicalDocumentationMine(user: User, id: string) { const provider = await this.configurationProvider(user); const service = await this.owned(provider.id, id); return this.documentation(service, true); }
  async saveClinicalDocumentationMine(user: User, id: string, dto: SaveProviderClinicalTemplateDto) { const provider = await this.configurationProvider(user, true); return this.saveClinicalDocumentation(provider.id, id, dto); }
  async resetClinicalDocumentationMine(user: User, id: string) { const provider = await this.configurationProvider(user, true); return this.resetClinicalDocumentation(provider.id, id); }

  async listForProvider(providerId: string) {
    await this.requireProvider(providerId);
    const rows = await this.services.find({ where: { providerId }, relations: { definition: true, deliveryOptions: true, clinicalTemplates: true }, order: { createdAt: 'ASC', deliveryOptions: { deliveryMode: 'ASC' } } });
    return rows.map((row) => ({ ...row, clinicalTemplates: undefined, clinicalDocumentation: this.documentation(row, false) }));
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

  async saveClinicalDocumentation(providerId: string, id: string, dto: SaveProviderClinicalTemplateDto) {
    return this.services.manager.transaction(async (manager) => {
      const service = await manager.getRepository(ProviderCareService).findOne({ where: { id, providerId }, relations: { definition: true }, lock: { mode: 'pessimistic_write', tables: ['provider_care_services'] } });
      if (!service) throw new NotFoundException('Provider care service was not found');
      if (!isTemplateDrivenType(service.definition.clinicalRecordType)) throw new ConflictException('This care service does not support a custom clinical documentation template');
      const fields = validateCustomTemplate(service.definition.clinicalRecordType, dto.fields);
      const repository = manager.getRepository(ProviderCareServiceClinicalTemplate);
      const latest = await repository.createQueryBuilder('template').select('MAX(template.version)', 'version').where('template.providerCareServiceId = :id', { id: service.id }).getRawOne<{ version: string | null }>();
      await repository.update({ providerCareServiceId: service.id, isCurrent: true }, { isCurrent: false });
      const template = await repository.save(repository.create({ providerCareServiceId: service.id, version: Number(latest?.version ?? 0) + 1, recordType: service.definition.clinicalRecordType, fields, isCurrent: true }));
      service.clinicalTemplates = [template];
      return this.documentation(service, true);
    });
  }

  async resetClinicalDocumentation(providerId: string, id: string) {
    return this.services.manager.transaction(async (manager) => {
      const service = await manager.getRepository(ProviderCareService).findOne({ where: { id, providerId }, relations: { definition: true }, lock: { mode: 'pessimistic_write', tables: ['provider_care_services'] } });
      if (!service) throw new NotFoundException('Provider care service was not found');
      await manager.getRepository(ProviderCareServiceClinicalTemplate).update({ providerCareServiceId: service.id, isCurrent: true }, { isCurrent: false });
      service.clinicalTemplates = [];
      return this.documentation(service, true);
    });
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
    const service = await this.services.findOne({ where: { id, providerId }, relations: { definition: true, clinicalTemplates: true } });
    if (!service) throw new NotFoundException('Provider care service was not found');
    return service;
  }
  private async requireProvider(id: string) {
    const provider = await this.providers.findOne({ where: { id }, withDeleted: true });
    if (!provider || provider.deletedAt) throw new NotFoundException('Provider was not found');
    return provider;
  }
  private async configurationProvider(user: User, mutation = false) {
    return this.configurationContext.resolve(user, mutation);
  }

  private documentation(service: ProviderCareService, includeFields: boolean) {
    const type = service.definition.clinicalRecordType;
    if (!type) return null;
    if (type === ClinicalRecordType.CONSULTATION) return { clinicalRecordType: type, templateMode: 'STANDARD', templateVersion: null, ...(includeFields ? { fields: [] } : {}) };
    const custom = (service.clinicalTemplates ?? []).filter((template) => template.isCurrent && template.recordType === type).sort((a, b) => b.version - a.version)[0];
    return { clinicalRecordType: type, templateMode: custom ? ClinicalDocumentationTemplateMode.CUSTOM : ClinicalDocumentationTemplateMode.DEFAULT, templateVersion: custom?.version ?? null, ...(includeFields ? { fields: custom?.fields ?? genericTemplate(type) } : {}) };
  }
}
