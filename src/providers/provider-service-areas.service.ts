import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProviderServiceAreaDto, UpdateProviderServiceAreaDto } from './dto/provider-service-area.dto';
import { ProviderServiceArea } from './entities/provider-service-area.entity';
import { ProviderService } from './entities/provider-service.entity';

@Injectable()
export class ProviderServiceAreasService {
  constructor(@InjectRepository(ProviderServiceArea) private readonly areas: Repository<ProviderServiceArea>, @InjectRepository(ProviderService) private readonly services: Repository<ProviderService>) {}
  async list(providerId: string) { return this.areas.find({ where: { providerId }, relations: { providerService: { fulfilmentMode: true } }, order: { createdAt: 'ASC' } }); }
  async get(providerId: string, id: string) { const row = await this.areas.findOne({ where: { id, providerId }, relations: { providerService: { fulfilmentMode: true } } }); if (!row) throw new NotFoundException('Provider service area not found'); return row; }
  async create(providerId: string, dto: CreateProviderServiceAreaDto) { await this.requireHomeVisitService(providerId, dto.providerServiceId); return this.areas.save(this.areas.create({ ...this.normalize(dto), providerId, providerServiceId: dto.providerServiceId, isActive: true })); }
  async update(providerId: string, id: string, dto: UpdateProviderServiceAreaDto) { const row = await this.get(providerId, id); const serviceId = dto.providerServiceId ?? row.providerServiceId; await this.requireHomeVisitService(providerId, serviceId); Object.assign(row, this.normalize({ countryCode: dto.countryCode ?? row.countryCode, stateOrRegion: dto.stateOrRegion ?? row.stateOrRegion, city: dto.city !== undefined ? dto.city : row.city, postalCode: dto.postalCode !== undefined ? dto.postalCode : row.postalCode }), { providerServiceId: serviceId }); return this.areas.save(row); }
  async activate(providerId: string, id: string) { const row = await this.get(providerId, id); await this.requireHomeVisitService(providerId, row.providerServiceId); row.isActive = true; return this.areas.save(row); }
  async deactivate(providerId: string, id: string) { const row = await this.get(providerId, id); row.isActive = false; return this.areas.save(row); }
  private normalize(dto: Pick<CreateProviderServiceAreaDto, 'countryCode'|'stateOrRegion'|'city'|'postalCode'>) { return { countryCode: dto.countryCode.trim().toUpperCase(), stateOrRegion: dto.stateOrRegion.trim(), city: dto.city?.trim() || null, postalCode: dto.postalCode?.trim() || null }; }
  private async requireHomeVisitService(providerId: string, id: string) { const service = await this.services.findOne({ where: { id }, relations: { fulfilmentMode: true, healthCheckPackage: true } }); if (!service) throw new NotFoundException('Provider service not found'); if (service.providerId !== providerId) throw new ConflictException('Provider service belongs to a different provider'); if (!service.isActive || !service.fulfilmentMode?.isActive || !service.healthCheckPackage?.isActive) throw new BadRequestException('Provider service is inactive'); if (service.fulfilmentMode.code !== 'HOME_VISIT') throw new BadRequestException('Service areas are only valid for HOME_VISIT capabilities'); }
}
