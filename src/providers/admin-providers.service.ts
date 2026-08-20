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
  CreateAdminProviderDto,
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
    const [capabilityCount, locationCount] = await Promise.all([
      this.capabilities.countBy({ providerId: id }),
      this.locations.countBy({ providerId: id }),
    ]);
    return { ...this.map(provider), capabilityCount, locationCount };
  }

  async create(
    dto: CreateAdminProviderDto,
  ): Promise<AdminProviderDetailResponseDto> {
    const provider = await this.providers.save(
      this.providers.create({
        displayName: dto.displayName.trim(),
        professionalReference: dto.professionalReference?.trim() || null,
        userId: null,
        status: ProviderStatus.PENDING,
      }),
    );
    return { ...this.map(provider), capabilityCount: 0, locationCount: 0 };
  }

  async update(
    id: string,
    dto: UpdateAdminProviderDto,
  ): Promise<AdminProviderDetailResponseDto> {
    const provider = await this.requireProvider(id);
    if (dto.displayName !== undefined)
      provider.displayName = dto.displayName.trim();
    if (dto.professionalReference !== undefined)
      provider.professionalReference =
        dto.professionalReference?.trim() || null;
    await this.providers.save(provider);
    return this.get(id);
  }

  async activate(id: string): Promise<AdminProviderDetailResponseDto> {
    const provider = await this.requireProvider(id);
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
      professionalReference: provider.professionalReference,
      status: provider.status,
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
