import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { CreateProviderAvailabilityDto } from "./dto/create-provider-availability.dto";
import { ProviderAvailabilityResponseDto } from "./dto/provider-availability-response.dto";
import { UpdateProviderAvailabilityDto } from "./dto/update-provider-availability.dto";
import { ProviderAvailability } from "./entities/provider-availability.entity";
import { ProviderLocation } from "./entities/provider-location.entity";
import { ProviderService } from "./entities/provider-service.entity";
import { Provider } from "./entities/provider.entity";
import { ProviderStatus } from "./enums/provider-status.enum";

@Injectable()
export class ProviderAvailabilityService {
  constructor(
    @InjectRepository(ProviderAvailability)
    private readonly availability: Repository<ProviderAvailability>,
    @InjectRepository(Provider)
    private readonly providers: Repository<Provider>,
    @InjectRepository(ProviderService)
    private readonly services: Repository<ProviderService>,
    @InjectRepository(ProviderLocation)
    private readonly locations: Repository<ProviderLocation>,
  ) {}

  async list(providerId: string): Promise<ProviderAvailabilityResponseDto[]> {
    await this.requireProvider(providerId);
    return (
      await this.availability.find({
        where: { providerId },
        order: { dayOfWeek: "ASC", startTime: "ASC" },
      })
    ).map(ProviderAvailabilityResponseDto.fromEntity);
  }
  async get(id: string): Promise<ProviderAvailabilityResponseDto> {
    return ProviderAvailabilityResponseDto.fromEntity(
      await this.requireAvailability(id),
    );
  }
  async create(
    providerId: string,
    dto: CreateProviderAvailabilityDto,
  ): Promise<ProviderAvailabilityResponseDto> {
    await this.validateActiveScope(
      providerId,
      dto.providerServiceId ?? null,
      dto.providerLocationId ?? null,
    );
    this.validateTimeRange(
      dto.startTime,
      dto.endTime,
      dto.bookingStopTime ?? null,
    );
    await this.rejectOverlap(
      providerId,
      dto.dayOfWeek,
      dto.startTime,
      dto.endTime,
      dto.providerServiceId ?? null,
      dto.providerLocationId ?? null,
    );
    try {
      return ProviderAvailabilityResponseDto.fromEntity(
        await this.availability.save(
          this.availability.create({
            ...dto,
            providerId,
            providerServiceId: dto.providerServiceId ?? null,
            providerLocationId: dto.providerLocationId ?? null,
            bookingStopTime: dto.bookingStopTime ?? null,
            isActive: true,
          }),
        ),
      );
    } catch (error) {
      this.rethrowOverlap(error);
    }
  }
  async update(
    id: string,
    dto: UpdateProviderAvailabilityDto,
  ): Promise<ProviderAvailabilityResponseDto> {
    const value = await this.requireAvailability(id);
    const candidate = {
      providerServiceId:
        dto.providerServiceId !== undefined
          ? dto.providerServiceId
          : value.providerServiceId,
      providerLocationId:
        dto.providerLocationId !== undefined
          ? dto.providerLocationId
          : value.providerLocationId,
      dayOfWeek: dto.dayOfWeek ?? value.dayOfWeek,
      startTime: dto.startTime ?? value.startTime,
      endTime: dto.endTime ?? value.endTime,
      bookingStopTime:
        dto.bookingStopTime !== undefined
          ? dto.bookingStopTime
          : value.bookingStopTime,
      timezone: dto.timezone ?? value.timezone,
    };
    this.validateTimeRange(
      candidate.startTime,
      candidate.endTime,
      candidate.bookingStopTime,
    );
    if (value.isActive) {
      await this.validateActiveScope(
        value.providerId,
        candidate.providerServiceId ?? null,
        candidate.providerLocationId ?? null,
      );
      await this.rejectOverlap(
        value.providerId,
        candidate.dayOfWeek,
        candidate.startTime,
        candidate.endTime,
        candidate.providerServiceId ?? null,
        candidate.providerLocationId ?? null,
        value.id,
      );
    }
    Object.assign(value, candidate);
    try {
      return ProviderAvailabilityResponseDto.fromEntity(
        await this.availability.save(value),
      );
    } catch (error) {
      this.rethrowOverlap(error);
    }
  }
  async activate(id: string): Promise<ProviderAvailabilityResponseDto> {
    const value = await this.requireAvailability(id);
    await this.validateActiveScope(
      value.providerId,
      value.providerServiceId,
      value.providerLocationId,
    );
    await this.rejectOverlap(
      value.providerId,
      value.dayOfWeek,
      value.startTime,
      value.endTime,
      value.providerServiceId,
      value.providerLocationId,
      value.id,
    );
    value.isActive = true;
    try {
      return ProviderAvailabilityResponseDto.fromEntity(
        await this.availability.save(value),
      );
    } catch (error) {
      this.rethrowOverlap(error);
    }
  }
  async deactivate(id: string): Promise<ProviderAvailabilityResponseDto> {
    const value = await this.requireAvailability(id);
    value.isActive = false;
    return ProviderAvailabilityResponseDto.fromEntity(
      await this.availability.save(value),
    );
  }

  private validateTimeRange(
    startTime: string,
    endTime: string,
    bookingStopTime: string | null,
  ): void {
    const start = this.timeToSeconds(startTime);
    const end = this.timeToSeconds(endTime);
    if (start >= end)
      throw new BadRequestException(
        "startTime must be before endTime; overnight blocks are not supported",
      );
    if (bookingStopTime != null) {
      const stop = this.timeToSeconds(bookingStopTime);
      if (stop <= start || stop > end)
        throw new BadRequestException(
          "bookingStopTime must be after startTime and no later than endTime",
        );
    }
  }
  private timeToSeconds(value: string): number {
    const [hours, minutes, seconds = "0"] = value.split(":");
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  }
  private async validateActiveScope(
    providerId: string,
    serviceId: string | null,
    locationId: string | null,
  ): Promise<void> {
    const provider = await this.requireProvider(providerId);
    if (
      ![ProviderStatus.ACTIVE, ProviderStatus.PENDING].includes(provider.status)
    )
      throw new BadRequestException(
        "Provider must be active or pending to manage availability",
      );
    if (serviceId) {
      const service = await this.services.findOne({ where: { id: serviceId } });
      if (!service) throw new NotFoundException("Provider service not found");
      if (service.providerId !== providerId)
        throw new ConflictException(
          "Provider service belongs to a different provider",
        );
      if (!service.isActive)
        throw new BadRequestException("Provider service is inactive");
    }
    if (locationId) {
      const location = await this.locations.findOne({
        where: { id: locationId },
      });
      if (!location) throw new NotFoundException("Provider location not found");
      if (location.providerId !== providerId)
        throw new ConflictException(
          "Provider location belongs to a different provider",
        );
      if (!location.isActive)
        throw new BadRequestException("Provider location is inactive");
    }
  }
  private async rejectOverlap(
    providerId: string,
    dayOfWeek: string,
    startTime: string,
    endTime: string,
    serviceId: string | null,
    locationId: string | null,
    excludeId?: string,
  ): Promise<void> {
    const query = this.availability
      .createQueryBuilder("availability")
      .where("availability.providerId = :providerId", { providerId })
      .andWhere("availability.dayOfWeek = :dayOfWeek", { dayOfWeek })
      .andWhere(
        "availability.providerServiceId IS NOT DISTINCT FROM :serviceId",
        { serviceId },
      )
      .andWhere(
        "availability.providerLocationId IS NOT DISTINCT FROM :locationId",
        { locationId },
      )
      .andWhere("availability.isActive = true")
      .andWhere("availability.startTime < :endTime", { endTime })
      .andWhere("availability.endTime > :startTime", { startTime });
    if (excludeId)
      query.andWhere("availability.id != :excludeId", { excludeId });
    if (await query.getExists())
      throw new ConflictException(
        "Availability overlaps an active block for the same scope",
      );
  }
  private async requireProvider(id: string): Promise<Provider> {
    const value = await this.providers.findOne({ where: { id } });
    if (!value) throw new NotFoundException("Provider not found");
    return value;
  }
  private async requireAvailability(id: string): Promise<ProviderAvailability> {
    const value = await this.availability.findOne({ where: { id } });
    if (!value) throw new NotFoundException("Provider availability not found");
    return value;
  }
  private rethrowOverlap(error: unknown): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { constraint?: string }).constraint ===
        "EX_provider_availability_active_overlap"
    )
      throw new ConflictException(
        "Availability overlaps an active block for the same scope",
      );
    throw error;
  }
}
