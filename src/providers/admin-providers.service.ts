import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import { UserStatus } from "../users/enums/user-status.enum";
import {
  AdminProviderDetailResponseDto,
  AdminProviderListItemResponseDto,
  AdminProviderListQueryDto,
  AdminProviderListResponseDto,
  UpdateAdminProviderDto,
} from "./dto/admin-provider-management.dto";
import { ProviderAssignment } from "./entities/provider-assignment.entity";
import { ProviderBookingReservation } from "./entities/provider-booking-reservation.entity";
import { ProviderLocation } from "./entities/provider-location.entity";
import { ProviderService } from "./entities/provider-service.entity";
import { Provider } from "./entities/provider.entity";
import { ProviderAssignmentStatus } from "./enums/provider-assignment-status.enum";
import { ProviderBookingReservationStatus } from "./enums/provider-booking-reservation-status.enum";
import { ProviderStatus } from "./enums/provider-status.enum";
import { ProviderOnboardingStatus } from "./enums/provider-onboarding-status.enum";
import { ProviderOnboardingReadinessService } from "./provider-onboarding-readiness.service";

@Injectable()
export class AdminProvidersService {
  constructor(
    @InjectRepository(Provider)
    private readonly providers: Repository<Provider>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ProviderAssignment)
    private readonly assignments: Repository<ProviderAssignment>,
    @InjectRepository(ProviderBookingReservation)
    private readonly reservations: Repository<ProviderBookingReservation>,
    @InjectRepository(ProviderService)
    private readonly capabilities: Repository<ProviderService>,
    @InjectRepository(ProviderLocation)
    private readonly locations: Repository<ProviderLocation>,
    private readonly readiness: ProviderOnboardingReadinessService,
  ) {}

 async list(
  query: AdminProviderListQueryDto,
): Promise<AdminProviderListResponseDto> {
  const builder = this.providers
    .createQueryBuilder("provider")
    .leftJoinAndSelect("provider.user", "user");

  if (query.status) {
    builder.andWhere("provider.status = :status", {
      status: query.status,
    });
  }
  if (query.onboardingStatus) builder.andWhere("provider.onboardingStatus = :onboardingStatus", { onboardingStatus: query.onboardingStatus });

  if (query.linkedUserId) {
    builder.andWhere("provider.userId = :linkedUserId", {
      linkedUserId: query.linkedUserId,
    });
  }

  if (query.search) {
    builder.andWhere(
      "provider.displayName ILIKE :search",
      {
        search: `%${query.search}%`,
      },
    );
  }

  builder
    .orderBy("provider.createdAt", "ASC")
    .addOrderBy("provider.id", "ASC")
    .skip((query.page - 1) * query.limit)
    .take(query.limit);

  const [rows, total] =
    await builder.getManyAndCount();

  return {
    items: rows.map((provider) =>
      this.map(provider),
    ),
    page: query.page,
    limit: query.limit,
    total,
    totalPages:
      total === 0
        ? 0
        : Math.ceil(total / query.limit),
  };
}

  async get(id: string): Promise<AdminProviderDetailResponseDto> {
    const provider = await this.requireProvider(id);
    const [capabilityCount, locationCount, readiness] = await Promise.all([
      this.capabilities.countBy({ providerId: id }),
      this.locations.countBy({ providerId: id }),
      this.readiness.evaluate(id),
    ]);
    return { ...this.map(provider), capabilityCount, locationCount, readiness };
  }

  async update(
    id: string,
    dto: UpdateAdminProviderDto,
  ): Promise<AdminProviderDetailResponseDto> {
    const provider = await this.requireProvider(id);
    if (dto.displayName !== undefined)
      provider.displayName = dto.displayName.trim();
    if (dto.phone !== undefined) provider.phone = dto.phone?.trim() || null;
    if (dto.professionalReference !== undefined)
      provider.professionalReference =
        dto.professionalReference?.trim() || null;
    if (dto.providerType !== undefined) provider.providerType = dto.providerType;
    if (dto.countryCode !== undefined) provider.countryCode = dto.countryCode.toUpperCase();
    if (dto.stateOrRegion !== undefined) provider.stateOrRegion = dto.stateOrRegion.trim();
    if (dto.city !== undefined) provider.city = dto.city.trim();
    await this.providers.save(provider);
    return this.get(id);
  }

  async activate(id: string): Promise<AdminProviderDetailResponseDto> {
    const provider = await this.requireProvider(id);
    if (provider.onboardingStatus !== ProviderOnboardingStatus.APPROVED) throw new ConflictException("Provider must be approved before activation");
    provider.status = ProviderStatus.ACTIVE;
    await this.providers.save(provider);
    return this.get(id);
  }
  async suspend(id: string): Promise<AdminProviderDetailResponseDto> {
    const provider = await this.requireProvider(id);
    provider.status = ProviderStatus.SUSPENDED;
    await this.providers.save(provider);
    return this.get(id);
  }

  async approve(id: string, actorUserId: string): Promise<AdminProviderDetailResponseDto> {
    await this.providers.manager.transaction(async (manager) => {
      const providerRepository = manager.getRepository(Provider);
      const provider = await providerRepository.findOne({ where: { id }, withDeleted: true, lock: { mode: "pessimistic_write" } });
      if (!provider || provider.deletedAt) throw new NotFoundException("Provider not found");
      if (provider.onboardingStatus !== ProviderOnboardingStatus.SUBMITTED) throw new ConflictException("Only submitted provider onboarding can be approved");
      if (![provider.displayName, provider.email, provider.providerType, provider.countryCode, provider.stateOrRegion, provider.city].every(Boolean)) throw new ConflictException("Provider profile is incomplete");
      if (!provider.userId) throw new ConflictException("Provider requires a linked account before approval");
      const user = await manager.getRepository(User).findOne({ where: { id: provider.userId }, withDeleted: true, lock: { mode: "pessimistic_write" } });
      if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE || !user.roles.includes(UserRole.PROVIDER)) throw new ConflictException("Linked provider account is not eligible for approval");
      const readiness = await this.readiness.evaluate(provider.id, manager);
      if (readiness.blockers.length) throw new ConflictException({ message: "Provider onboarding configuration is incomplete", blockers: readiness.blockers, readiness });
      provider.onboardingStatus = ProviderOnboardingStatus.APPROVED;
      provider.status = ProviderStatus.ACTIVE;
      provider.reviewedAt = new Date();
      provider.reviewedByUserId = actorUserId;
      provider.reviewNote = null;
      await providerRepository.save(provider);
    });
    return this.get(id);
  }

  async reject(id: string, actorUserId: string, reviewNote?: string | null): Promise<AdminProviderDetailResponseDto> {
    await this.providers.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Provider);
      const provider = await repository.findOne({ where: { id }, withDeleted: true, lock: { mode: "pessimistic_write" } });
      if (!provider || provider.deletedAt) throw new NotFoundException("Provider not found");
      if (provider.onboardingStatus !== ProviderOnboardingStatus.SUBMITTED) throw new ConflictException("Only submitted provider onboarding can be rejected");
      provider.onboardingStatus = ProviderOnboardingStatus.REJECTED;
      provider.status = ProviderStatus.PENDING;
      provider.reviewedAt = new Date();
      provider.reviewedByUserId = actorUserId;
      provider.reviewNote = reviewNote?.trim() || null;
      await repository.save(provider);
    });
    return this.get(id);
  }

  async linkUser(
    providerId: string,
    userId: string,
  ): Promise<AdminProviderDetailResponseDto> {
    await this.providers.manager.transaction(async (manager) => {
      const providerRepository = manager.getRepository(Provider);
      const userRepository = manager.getRepository(User);
      const provider = await providerRepository.findOne({
        where: { id: providerId },
        lock: { mode: "pessimistic_write" },
      });
      if (!provider) throw new NotFoundException("Provider not found");
      if (provider.userId)
        throw new ConflictException("Provider is already linked to a user");
      const user = await userRepository.findOne({
        where: { id: userId },
        withDeleted: true,
        lock: { mode: "pessimistic_write" },
      });
      if (!user) throw new NotFoundException("User not found");
      if (user.deletedAt || user.status !== UserStatus.ACTIVE)
        throw new ConflictException(
          "User account is not eligible for provider linking",
        );
      if (await providerRepository.exists({ where: { userId } }))
        throw new ConflictException(
          "User is already linked to another provider",
        );
      provider.userId = user.id;
      user.roles = [...new Set([...user.roles, UserRole.PROVIDER])];
      await userRepository.save(user);
      await providerRepository.save(provider);
    });
    return this.get(providerId);
  }

  async unlinkUser(
    providerId: string,
  ): Promise<AdminProviderDetailResponseDto> {
    await this.providers.manager.transaction(async (manager) => {
      const providerRepository = manager.getRepository(Provider);
      const userRepository = manager.getRepository(User);
      const provider = await providerRepository.findOne({
        where: { id: providerId },
        lock: { mode: "pessimistic_write" },
      });
      if (!provider) throw new NotFoundException("Provider not found");
      if (!provider.userId)
        throw new ConflictException("Provider is not linked to a user");
      const activeAssignments = await manager
        .getRepository(ProviderAssignment)
        .exists({
          where: {
            providerId,
            status: In([
              ProviderAssignmentStatus.OFFERED,
              ProviderAssignmentStatus.ACCEPTED,
              ProviderAssignmentStatus.CONFIRMED,
            ]),
          },
        });
      const activeReservations = await manager
        .getRepository(ProviderBookingReservation)
        .exists({
          where: {
            providerId,
            status: In([
              ProviderBookingReservationStatus.HELD,
              ProviderBookingReservationStatus.CONFIRMED,
            ]),
          },
        });
      if (activeAssignments || activeReservations)
        throw new ConflictException(
          "Provider account cannot be unlinked while active work exists",
        );
      const user = await userRepository.findOne({
        where: { id: provider.userId },
        withDeleted: true,
        lock: { mode: "pessimistic_write" },
      });
      if (!user)
        throw new ConflictException("Linked user account no longer exists");
      provider.userId = null;
      user.roles = user.roles.filter((role) => role !== UserRole.PROVIDER);
      await userRepository.save(user);
      await providerRepository.save(provider);
    });
    return this.get(providerId);
  }

  private async requireProvider(id: string): Promise<Provider> {
    const provider = await this.providers.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!provider) throw new NotFoundException("Provider not found");
    return provider;
  }
  private map(provider: Provider): AdminProviderListItemResponseDto {
    return {
      id: provider.id,
      displayName: provider.displayName,
      email: provider.email,
      phone: provider.phone,
      professionalReference: provider.professionalReference,
      providerType: provider.providerType,
      countryCode: provider.countryCode,
      stateOrRegion: provider.stateOrRegion,
      city: provider.city,
      status: provider.status,
      onboardingStatus: provider.onboardingStatus,
      submittedAt: provider.submittedAt,
      reviewedAt: provider.reviewedAt,
      reviewNote: provider.reviewNote,
      linkedUser: provider.user
        ? {
            id: provider.user.id,
            email: provider.user.email,
            displayName: provider.user.displayName,
            roles: provider.user.roles,
            status: provider.user.status,
          }
        : null,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }
}
