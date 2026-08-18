import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { isTimeZone } from 'class-validator';
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
import { DayOfWeek } from './enums/day-of-week.enum';

export const PROVIDER_LOCATION_MODE = 'PROVIDER_LOCATION';
export interface AvailabilityWindow {
  requestedDate: string;
  requestedStartTime: string;
  requestedEndTime: string;
  requestedTimezone: string;
}

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

  async findEligibleProviders(healthCheckPackageId: string, fulfilmentModeId: string, window?: AvailabilityWindow): Promise<ProviderServiceResponseDto[]> {
    const query = this.services.createQueryBuilder('service').distinct(true).innerJoinAndSelect('service.provider', 'provider').innerJoinAndSelect('service.healthCheckPackage', 'package').innerJoinAndSelect('service.fulfilmentMode', 'mode').leftJoinAndSelect('service.locationLinks', 'locationLinks').leftJoinAndSelect('locationLinks.providerLocation', 'location', 'location.is_active = true').where('service.health_check_package_id = :healthCheckPackageId', { healthCheckPackageId }).andWhere('service.fulfilment_mode_id = :fulfilmentModeId', { fulfilmentModeId }).andWhere('service.is_active = true').andWhere('provider.status = :status', { status: ProviderStatus.ACTIVE }).andWhere('provider.deleted_at IS NULL').andWhere('package.is_active = true').andWhere('mode.is_active = true');
    if (window) {
      const dayOfWeek = this.validateAvailabilityWindow(window);
      const applicableLocation = `(scope.provider_location_id IS NULL OR EXISTS (SELECT 1 FROM provider_locations scoped_location INNER JOIN provider_service_locations scoped_link ON scoped_link.provider_location_id = scoped_location.id WHERE scoped_location.id = scope.provider_location_id AND scoped_location.is_active = true AND scoped_link.provider_service_id = service.id))`;
      query.andWhere(`(EXISTS (SELECT 1 FROM provider_availability scope WHERE scope.provider_id = provider.id AND scope.is_active = true AND scope.day_of_week = :dayOfWeek AND scope.timezone = :requestedTimezone AND scope.start_time <= :requestedStartTime AND scope.end_time >= :requestedEndTime AND (scope.provider_service_id IS NULL OR scope.provider_service_id = service.id) AND ${applicableLocation}) OR EXISTS (SELECT 1 FROM provider_availability_exceptions scope WHERE scope.provider_id = provider.id AND scope.is_active = true AND scope.type = 'AVAILABLE' AND scope.date = :requestedDate AND scope.timezone = :requestedTimezone AND (scope.start_time IS NULL OR (scope.start_time <= :requestedStartTime AND scope.end_time >= :requestedEndTime)) AND (scope.provider_service_id IS NULL OR scope.provider_service_id = service.id) AND ${applicableLocation}))`, { dayOfWeek, requestedDate: window.requestedDate, requestedTimezone: window.requestedTimezone, requestedStartTime: window.requestedStartTime, requestedEndTime: window.requestedEndTime });
      query.andWhere(`NOT EXISTS (SELECT 1 FROM provider_availability_exceptions scope WHERE scope.provider_id = provider.id AND scope.is_active = true AND scope.type = 'UNAVAILABLE' AND scope.date = :requestedDate AND scope.timezone = :requestedTimezone AND (scope.start_time IS NULL OR (scope.start_time < :requestedEndTime AND scope.end_time > :requestedStartTime)) AND (scope.provider_service_id IS NULL OR scope.provider_service_id = service.id) AND ${applicableLocation})`);
      query.andWhere(`NOT EXISTS (SELECT 1 FROM provider_booking_reservations reservation WHERE reservation.provider_id = provider.id AND reservation.scheduled_date = :requestedDate AND reservation.status IN ('HELD', 'CONFIRMED') AND reservation.start_time < :requestedEndTime AND reservation.end_time > :requestedStartTime)`);
    }
    const rows = await query.orderBy('service.created_at', 'ASC').getMany();
    return rows.map(ProviderServiceResponseDto.fromEntity);
  }

  private validateAvailabilityWindow(window: AvailabilityWindow): DayOfWeek {
    const parsedDate = new Date(`${window.requestedDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(window.requestedDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== window.requestedDate) throw new BadRequestException('requestedDate must be a valid ISO date');
    if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(window.requestedStartTime) || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(window.requestedEndTime) || this.timeToSeconds(window.requestedStartTime) >= this.timeToSeconds(window.requestedEndTime)) throw new BadRequestException('requestedStartTime must be before requestedEndTime and overnight windows are not supported');
    if (!isTimeZone(window.requestedTimezone)) throw new BadRequestException('requestedTimezone must be a valid IANA timezone');
    const days = [DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY];
    return days[parsedDate.getUTCDay()];
  }
  private timeToSeconds(value: string): number { const [hours, minutes, seconds = '0'] = value.split(':'); return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds); }

  private async requireProvider(id: string): Promise<Provider> { const value = await this.providers.findOne({ where: { id } }); if (!value) throw new NotFoundException('Provider not found'); return value; }
  private async requireService(id: string): Promise<ProviderService> { const value = await this.services.findOne({ where: { id }, relations: { locationLinks: true } }); if (!value) throw new NotFoundException('Provider service not found'); return value; }
  private async requireLocation(id: string): Promise<ProviderLocation> { const value = await this.locations.findOne({ where: { id } }); if (!value) throw new NotFoundException('Provider location not found'); return value; }
  private rethrowConflict(error: unknown, constraints: string[], message: string): never { if (error instanceof QueryFailedError && constraints.includes((error.driverError as { constraint?: string }).constraint ?? '')) throw new ConflictException(message); throw error; }
}
