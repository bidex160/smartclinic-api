import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { CreatePackagePriceDto } from './dto/create-package-price.dto';
import { PackagePriceResponseDto } from './dto/package-price-response.dto';
import { FulfilmentMode } from './entities/fulfilment-mode.entity';
import { HealthCheckPackage } from './entities/health-check-package.entity';
import { PackagePrice } from './entities/package-price.entity';
import { BOOKING_CURRENCY } from './package-pricing.service';

@Injectable()
export class PackagePricesService {
  constructor(
    @InjectRepository(PackagePrice)
    private readonly packagePriceRepository: Repository<PackagePrice>,
    @InjectRepository(HealthCheckPackage)
    private readonly healthCheckPackageRepository: Repository<HealthCheckPackage>,
    @InjectRepository(FulfilmentMode)
    private readonly fulfilmentModeRepository: Repository<FulfilmentMode>,
  ) {}

  async create(createPackagePriceDto: CreatePackagePriceDto): Promise<PackagePriceResponseDto> {
    await this.validateCreateInput(createPackagePriceDto);

    try {
      const packagePrice = await this.packagePriceRepository.save(
        this.packagePriceRepository.create({
          ...createPackagePriceDto,
          effectiveTo: createPackagePriceDto.effectiveTo ?? null,
          isActive: true,
        }),
      );
      return PackagePriceResponseDto.fromEntity(packagePrice);
    } catch (error) {
      this.rethrowOverlapConflict(error);
    }
  }

  async findAll(): Promise<PackagePriceResponseDto[]> {
    const packagePrices = await this.packagePriceRepository.find({
      order: { healthCheckPackageId: 'ASC', fulfilmentModeId: 'ASC', effectiveFrom: 'DESC' },
    });
    return packagePrices.map(PackagePriceResponseDto.fromEntity);
  }

  async findOne(id: string): Promise<PackagePriceResponseDto> {
    const packagePrice = await this.packagePriceRepository.findOne({ where: { id } });
    if (!packagePrice) {
      throw new NotFoundException('Package price not found');
    }
    return PackagePriceResponseDto.fromEntity(packagePrice);
  }

  async schedule(createPackagePriceDto: CreatePackagePriceDto): Promise<PackagePriceResponseDto> {
    await this.validateCreateInput(createPackagePriceDto);

    try {
      return await this.packagePriceRepository.manager.transaction(async (manager) => {
        const repository = manager.getRepository(PackagePrice);
        const existingPrices = await repository.find({
          where: {
            healthCheckPackageId: createPackagePriceDto.healthCheckPackageId,
            fulfilmentModeId: createPackagePriceDto.fulfilmentModeId,
            currency: createPackagePriceDto.currency,
            isActive: true,
          },
          order: { effectiveFrom: 'ASC' },
        });
        const nextPrice = existingPrices.find((price) => price.effectiveFrom > createPackagePriceDto.effectiveFrom);
        const coveringPrice = existingPrices.find(
          (price) =>
            price.effectiveFrom < createPackagePriceDto.effectiveFrom &&
            (price.effectiveTo === null || createPackagePriceDto.effectiveFrom < price.effectiveTo),
        );
        const effectiveTo = createPackagePriceDto.effectiveTo ?? nextPrice?.effectiveFrom ?? null;

        if (effectiveTo !== null && effectiveTo <= createPackagePriceDto.effectiveFrom) {
          throw new BadRequestException('effectiveTo must be after effectiveFrom');
        }
        if (
          nextPrice &&
          effectiveTo !== null &&
          effectiveTo !== nextPrice.effectiveFrom &&
          effectiveTo > nextPrice.effectiveFrom
        ) {
          throw new ConflictException('The requested price range overlaps an existing scheduled price');
        }
        if (coveringPrice) {
          coveringPrice.effectiveTo = createPackagePriceDto.effectiveFrom;
          await repository.save(coveringPrice);
        }

        const savedPrice = await repository.save(
          repository.create({
            ...createPackagePriceDto,
            effectiveTo,
            isActive: true,
          }),
        );
        return PackagePriceResponseDto.fromEntity(savedPrice);
      });
    } catch (error) {
      this.rethrowOverlapConflict(error);
    }
  }

  async deactivate(id: string): Promise<PackagePriceResponseDto> {
    const packagePrice = await this.packagePriceRepository.findOne({ where: { id } });
    if (!packagePrice) {
      throw new NotFoundException('Package price not found');
    }

    if (!packagePrice.isActive) {
      return PackagePriceResponseDto.fromEntity(packagePrice);
    }

    packagePrice.isActive = false;
    return PackagePriceResponseDto.fromEntity(await this.packagePriceRepository.save(packagePrice));
  }

  private async validateCreateInput(createPackagePriceDto: CreatePackagePriceDto): Promise<void> {
    if (Number(createPackagePriceDto.amount) <= 0) {
      throw new BadRequestException('amount must be greater than zero');
    }
    if (createPackagePriceDto.currency !== BOOKING_CURRENCY) {
      throw new UnprocessableEntityException(`V1 package prices must use ${BOOKING_CURRENCY}`);
    }
    if (
      createPackagePriceDto.effectiveTo !== undefined &&
      createPackagePriceDto.effectiveTo <= createPackagePriceDto.effectiveFrom
    ) {
      throw new BadRequestException('effectiveTo must be after effectiveFrom');
    }

    const [packageExists, fulfilmentModeExists] = await Promise.all([
      this.healthCheckPackageRepository.exists({
        where: { id: createPackagePriceDto.healthCheckPackageId, isActive: true },
      }),
      this.fulfilmentModeRepository.exists({
        where: { id: createPackagePriceDto.fulfilmentModeId, isActive: true },
      }),
    ]);
    if (!packageExists) {
      throw new BadRequestException('The selected Health Check package is unavailable');
    }
    if (!fulfilmentModeExists) {
      throw new BadRequestException('The selected fulfilment mode is unavailable');
    }
  }

  private rethrowOverlapConflict(error: unknown): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { constraint?: string } | undefined)?.constraint ===
        'EX_package_prices_active_effective_range'
    ) {
      throw new ConflictException('The requested price range overlaps an active price');
    }
    throw error;
  }
}
