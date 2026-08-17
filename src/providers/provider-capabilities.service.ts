import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { CreateProviderLocationDto } from './dto/create-provider-location.dto';
import { CreateProviderServiceDto } from './dto/create-provider-service.dto';
import { ProviderLocationResponseDto } from './dto/provider-location-response.dto';
import { ProviderServiceResponseDto } from './dto/provider-service-response.dto';
import { UpdateProviderLocationDto } from './dto/update-provider-location.dto';
import { ProviderLocation } from './entities/provider-location.entity';
import { ProviderServiceLocation } from './entities/provider-service-location.entity';
import { ProviderService } from './entities/provider-service.entity';
import { Provider } from './entities/provider.entity';
import { ProviderStatus } from './enums/provider-status.enum';

export const PROVIDER_LOCATION_MODE = 'PROVIDER_LOCATION';

@Injectable()
export class ProviderCapabilitiesService {
  constructor(
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    @InjectRepository(ProviderService) private readonly services: Repository<ProviderService>,
    @InjectRepository(ProviderLocation) private readonly locations: Repository<ProviderLocation>,
    @InjectRepository(ProviderServiceLocation) private readonly links: Repository<ProviderServiceLocation>,
    @InjectRepository(HealthCheckPackage) private readonly packages: Repository<HealthCheckPackage>,
    @InjectRepository(FulfilmentMode) private readonly modes: Repository<FulfilmentMode>,
  ) {}

  async listServices(providerId: string): Promise<ProviderServiceResponseDto[]> {
    await this.requireProvider(providerId);
    return (await this.services.find({ where: { providerId }, relations: { locationLinks: true }, order: { createdAt: 'ASC' } })).map(ProviderServiceResponseDto.fromEntity);
  }
  async getService(id: string): Promise<ProviderServiceResponseDto> { return ProviderServiceResponseDto.fromEntity(await this.requireService(id)); }
  async createService(providerId: string, dto: CreateProviderServiceDto): Promise<ProviderServiceResponseDto> {
    const [provider, healthPackage, mode] = await Promise.all([this.requireProvider(providerId), this.packages.findOne({ where: { id: dto.healthCheckPackageId } }), this.modes.findOne({ where: { id: dto.fulfilmentModeId } })]);
    if (provider.status !== ProviderStatus.ACTIVE) throw new BadRequestException('Provider must be active to add capabilities');
    if (!healthPackage) throw new NotFoundException('Health Check package not found');
    if (!healthPackage.isActive) throw new BadRequestException('Health Check package is inactive');
    if (!mode) throw new NotFoundException('Fulfilment mode not found');
    if (!mode.isActive) throw new BadRequestException('Fulfilment mode is inactive');
    if (await this.services.exists({ where: { providerId, healthCheckPackageId: dto.healthCheckPackageId, fulfilmentModeId: dto.fulfilmentModeId } })) throw new ConflictException('Provider capability already exists');
    try { return ProviderServiceResponseDto.fromEntity(await this.services.save(this.services.create({ providerId, ...dto, isActive: true }))); }
    catch (error) { this.rethrowConflict(error, ['UQ_provider_services_provider_package_mode'], 'Provider capability already exists'); }
  }
  async activateService(id: string): Promise<ProviderServiceResponseDto> {
    const service = await this.requireService(id);
    const provider = await this.requireProvider(service.providerId);
    if (provider.status !== ProviderStatus.ACTIVE) throw new BadRequestException('Provider must be active to activate capabilities');
    const [healthPackage, mode] = await Promise.all([this.packages.findOneBy({ id: service.healthCheckPackageId }), this.modes.findOneBy({ id: service.fulfilmentModeId })]);
    if (!healthPackage?.isActive) throw new BadRequestException('Health Check package is inactive');
    if (!mode?.isActive) throw new BadRequestException('Fulfilment mode is inactive');
    service.isActive = true; return ProviderServiceResponseDto.fromEntity(await this.services.save(service));
  }
  async deactivateService(id: string): Promise<ProviderServiceResponseDto> { const service = await this.requireService(id); service.isActive = false; return ProviderServiceResponseDto.fromEntity(await this.services.save(service)); }

  async listLocations(providerId: string): Promise<ProviderLocationResponseDto[]> { await this.requireProvider(providerId); return (await this.locations.find({ where: { providerId }, order: { createdAt: 'ASC' } })).map(ProviderLocationResponseDto.fromEntity); }
  async getLocation(id: string): Promise<ProviderLocationResponseDto> { return ProviderLocationResponseDto.fromEntity(await this.requireLocation(id)); }
  async createLocation(providerId: string, dto: CreateProviderLocationDto): Promise<ProviderLocationResponseDto> {
    await this.requireProvider(providerId);
    return ProviderLocationResponseDto.fromEntity(await this.locations.save(this.locations.create({ ...dto, providerId, addressLine2: dto.addressLine2 ?? null, latitude: dto.latitude?.toString() ?? null, longitude: dto.longitude?.toString() ?? null, isActive: true })));
  }
  async updateLocation(id: string, dto: UpdateProviderLocationDto): Promise<ProviderLocationResponseDto> {
    const location = await this.requireLocation(id);
    if (dto.name !== undefined) location.name = dto.name;
    if (dto.addressLine1 !== undefined) location.addressLine1 = dto.addressLine1;
    if (dto.addressLine2 !== undefined) location.addressLine2 = dto.addressLine2;
    if (dto.city !== undefined) location.city = dto.city;
    if (dto.state !== undefined) location.state = dto.state;
    if (dto.countryCode !== undefined) location.countryCode = dto.countryCode;
    if (dto.latitude !== undefined) location.latitude = dto.latitude === null ? null : dto.latitude.toString();
    if (dto.longitude !== undefined) location.longitude = dto.longitude === null ? null : dto.longitude.toString();
    return ProviderLocationResponseDto.fromEntity(await this.locations.save(location));
  }
  async activateLocation(id: string): Promise<ProviderLocationResponseDto> { const location = await this.requireLocation(id); location.isActive = true; return ProviderLocationResponseDto.fromEntity(await this.locations.save(location)); }
  async deactivateLocation(id: string): Promise<ProviderLocationResponseDto> { const location = await this.requireLocation(id); location.isActive = false; return ProviderLocationResponseDto.fromEntity(await this.locations.save(location)); }

  async linkLocation(serviceId: string, locationId: string): Promise<ProviderServiceResponseDto> {
    const [service, location] = await Promise.all([this.requireService(serviceId), this.requireLocation(locationId)]);
    if (service.providerId !== location.providerId) throw new ConflictException('Provider service and location must belong to the same provider');
    const mode = await this.modes.findOneBy({ id: service.fulfilmentModeId });
    if (mode?.code !== PROVIDER_LOCATION_MODE) throw new BadRequestException('Locations can only be linked to PROVIDER_LOCATION capabilities');
    if (await this.links.exists({ where: { providerServiceId: service.id, providerLocationId: location.id } })) throw new ConflictException('Provider location is already linked to this capability');
    try { await this.links.insert({ providerServiceId: service.id, providerLocationId: location.id, providerId: service.providerId }); }
    catch (error) { this.rethrowConflict(error, ['PK_provider_service_locations', 'UQ_provider_service_locations_service_location'], 'Provider location is already linked to this capability'); }
    return this.getService(serviceId);
  }
  async unlinkLocation(serviceId: string, locationId: string): Promise<void> {
    await Promise.all([this.requireService(serviceId), this.requireLocation(locationId)]);
    const result = await this.links.delete({ providerServiceId: serviceId, providerLocationId: locationId });
    if (!result.affected) throw new NotFoundException('Provider service location link not found');
  }

  async findEligibleProviders(healthCheckPackageId: string, fulfilmentModeId: string): Promise<ProviderServiceResponseDto[]> {
    const rows = await this.services.createQueryBuilder('service').innerJoinAndSelect('service.provider', 'provider').innerJoinAndSelect('service.healthCheckPackage', 'package').innerJoinAndSelect('service.fulfilmentMode', 'mode').leftJoinAndSelect('service.locationLinks', 'locationLinks').leftJoinAndSelect('locationLinks.providerLocation', 'location', 'location.is_active = true').where('service.health_check_package_id = :healthCheckPackageId', { healthCheckPackageId }).andWhere('service.fulfilment_mode_id = :fulfilmentModeId', { fulfilmentModeId }).andWhere('service.is_active = true').andWhere('provider.status = :status', { status: ProviderStatus.ACTIVE }).andWhere('provider.deleted_at IS NULL').andWhere('package.is_active = true').andWhere('mode.is_active = true').orderBy('service.created_at', 'ASC').getMany();
    return rows.map(ProviderServiceResponseDto.fromEntity);
  }

  private async requireProvider(id: string): Promise<Provider> { const value = await this.providers.findOne({ where: { id } }); if (!value) throw new NotFoundException('Provider not found'); return value; }
  private async requireService(id: string): Promise<ProviderService> { const value = await this.services.findOne({ where: { id }, relations: { locationLinks: true } }); if (!value) throw new NotFoundException('Provider service not found'); return value; }
  private async requireLocation(id: string): Promise<ProviderLocation> { const value = await this.locations.findOne({ where: { id } }); if (!value) throw new NotFoundException('Provider location not found'); return value; }
  private rethrowConflict(error: unknown, constraints: string[], message: string): never { if (error instanceof QueryFailedError && constraints.includes((error.driverError as { constraint?: string }).constraint ?? '')) throw new ConflictException(message); throw error; }
}
