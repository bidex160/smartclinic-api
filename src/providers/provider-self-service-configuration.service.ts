import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CreateProviderAvailabilityDto } from './dto/create-provider-availability.dto';
import { CreateProviderAvailabilityExceptionDto } from './dto/create-provider-availability-exception.dto';
import { CreateProviderLocationDto } from './dto/create-provider-location.dto';
import { CreateProviderServiceDto } from './dto/create-provider-service.dto';
import { UpdateProviderAvailabilityDto } from './dto/update-provider-availability.dto';
import { UpdateProviderAvailabilityExceptionDto } from './dto/update-provider-availability-exception.dto';
import { UpdateProviderLocationDto } from './dto/update-provider-location.dto';
import { ProviderAvailability } from './entities/provider-availability.entity';
import { ProviderAvailabilityException } from './entities/provider-availability-exception.entity';
import { ProviderLocation } from './entities/provider-location.entity';
import { ProviderService } from './entities/provider-service.entity';
import { ProviderAvailabilityExceptionsService } from './provider-availability-exceptions.service';
import { ProviderAvailabilityService } from './provider-availability.service';
import { ProviderCapabilitiesService } from './provider-capabilities.service';
import { ProviderConfigurationContextService } from './provider-configuration-context.service';
import { ProviderServiceAreasService } from './provider-service-areas.service';
import { CreateProviderServiceAreaDto, UpdateProviderServiceAreaDto } from './dto/provider-service-area.dto';
import { UpdateProviderServicePriceDto } from './dto/update-provider-service-price.dto';

@Injectable()
export class ProviderSelfServiceConfigurationService {
  constructor(
    private readonly context: ProviderConfigurationContextService,
    private readonly capabilities: ProviderCapabilitiesService,
    private readonly weekly: ProviderAvailabilityService,
    private readonly exceptionService: ProviderAvailabilityExceptionsService,
    @InjectRepository(ProviderService) private readonly services: Repository<ProviderService>,
    @InjectRepository(ProviderLocation) private readonly locations: Repository<ProviderLocation>,
    @InjectRepository(ProviderAvailability) private readonly availability: Repository<ProviderAvailability>,
    @InjectRepository(ProviderAvailabilityException) private readonly exceptions: Repository<ProviderAvailabilityException>,
    private readonly serviceAreas: ProviderServiceAreasService,
  ) {}

  async listServices(user: User) { const provider = await this.context.resolve(user); return this.capabilities.listServices(provider.id); }
  async createService(user: User, dto: CreateProviderServiceDto) { const provider = await this.context.resolve(user, true); return this.capabilities.createService(provider.id, dto); }
  async activateService(user: User, id: string) { await this.ownService(user, id, true); return this.capabilities.activateService(id); }
  async deactivateService(user: User, id: string) { await this.ownService(user, id, true); return this.capabilities.deactivateService(id); }
  async updateServicePrice(user: User, id: string, dto: UpdateProviderServicePriceDto) { await this.ownService(user, id, true); return this.capabilities.updateServicePrice(id, dto); }

  async listLocations(user: User) { const provider = await this.context.resolve(user); return this.capabilities.listLocations(provider.id); }
  async createLocation(user: User, dto: CreateProviderLocationDto) { const provider = await this.context.resolve(user, true); return this.capabilities.createLocation(provider.id, dto); }
  async getLocation(user: User, id: string) { await this.ownLocation(user, id); return this.capabilities.getLocation(id); }
  async updateLocation(user: User, id: string, dto: UpdateProviderLocationDto) { await this.ownLocation(user, id, true); return this.capabilities.updateLocation(id, dto); }
  async activateLocation(user: User, id: string) { await this.ownLocation(user, id, true); return this.capabilities.activateLocation(id); }
  async deactivateLocation(user: User, id: string) { await this.ownLocation(user, id, true); return this.capabilities.deactivateLocation(id); }
  async linkLocation(user: User, serviceId: string, locationId: string) { await Promise.all([this.ownService(user, serviceId, true), this.ownLocation(user, locationId, true)]); return this.capabilities.linkLocation(serviceId, locationId); }
  async unlinkLocation(user: User, serviceId: string, locationId: string) { await Promise.all([this.ownService(user, serviceId, true), this.ownLocation(user, locationId, true)]); return this.capabilities.unlinkLocation(serviceId, locationId); }

  async listAvailability(user: User) { const provider = await this.context.resolve(user); return this.weekly.list(provider.id); }
  async createAvailability(user: User, dto: CreateProviderAvailabilityDto) { const provider = await this.context.resolve(user, true); return this.weekly.create(provider.id, dto); }
  async getAvailability(user: User, id: string) { await this.ownAvailability(user, id); return this.weekly.get(id); }
  async updateAvailability(user: User, id: string, dto: UpdateProviderAvailabilityDto) { await this.ownAvailability(user, id, true); return this.weekly.update(id, dto); }
  async activateAvailability(user: User, id: string) { await this.ownAvailability(user, id, true); return this.weekly.activate(id); }
  async deactivateAvailability(user: User, id: string) { await this.ownAvailability(user, id, true); return this.weekly.deactivate(id); }

  async listExceptions(user: User) { const provider = await this.context.resolve(user); return this.exceptionService.list(provider.id); }
  async createException(user: User, dto: CreateProviderAvailabilityExceptionDto) { const provider = await this.context.resolve(user, true); return this.exceptionService.create(provider.id, dto); }
  async getException(user: User, id: string) { await this.ownException(user, id); return this.exceptionService.get(id); }
  async updateException(user: User, id: string, dto: UpdateProviderAvailabilityExceptionDto) { await this.ownException(user, id, true); return this.exceptionService.update(id, dto); }
  async activateException(user: User, id: string) { await this.ownException(user, id, true); return this.exceptionService.activate(id); }
  async deactivateException(user: User, id: string) { await this.ownException(user, id, true); return this.exceptionService.deactivate(id); }
  async listServiceAreas(user: User) { const provider = await this.context.resolve(user); return this.serviceAreas.list(provider.id); }
  async getServiceArea(user: User, id: string) { const provider = await this.context.resolve(user); return this.serviceAreas.get(provider.id, id); }
  async createServiceArea(user: User, dto: CreateProviderServiceAreaDto) { const provider = await this.context.resolve(user, true); return this.serviceAreas.create(provider.id, dto); }
  async updateServiceArea(user: User, id: string, dto: UpdateProviderServiceAreaDto) { const provider = await this.context.resolve(user, true); return this.serviceAreas.update(provider.id, id, dto); }
  async activateServiceArea(user: User, id: string) { const provider = await this.context.resolve(user, true); return this.serviceAreas.activate(provider.id, id); }
  async deactivateServiceArea(user: User, id: string) { const provider = await this.context.resolve(user, true); return this.serviceAreas.deactivate(provider.id, id); }

  private async ownService(user: User, id: string, mutation = false) { const provider = await this.context.resolve(user, mutation); const row = await this.services.findOne({ where: { id, providerId: provider.id } }); if (!row) throw new NotFoundException('Provider service not found'); return row; }
  private async ownLocation(user: User, id: string, mutation = false) { const provider = await this.context.resolve(user, mutation); const row = await this.locations.findOne({ where: { id, providerId: provider.id } }); if (!row) throw new NotFoundException('Provider location not found'); return row; }
  private async ownAvailability(user: User, id: string, mutation = false) { const provider = await this.context.resolve(user, mutation); const row = await this.availability.findOne({ where: { id, providerId: provider.id } }); if (!row) throw new NotFoundException('Provider availability not found'); return row; }
  private async ownException(user: User, id: string, mutation = false) { const provider = await this.context.resolve(user, mutation); const row = await this.exceptions.findOne({ where: { id, providerId: provider.id } }); if (!row) throw new NotFoundException('Provider availability exception not found'); return row; }
}
