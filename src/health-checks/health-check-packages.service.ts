import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { HealthCheckPackageResponseDto } from './dto/health-check-package-response.dto';
import { HealthCheckPackage } from './entities/health-check-package.entity';
import { PackagePrice } from './entities/package-price.entity';

@Injectable()
export class HealthCheckPackagesService {
  constructor(
    @InjectRepository(HealthCheckPackage)
    private readonly healthCheckPackageRepository: Repository<HealthCheckPackage>,
  ) {}

  async findActive(): Promise<HealthCheckPackageResponseDto[]> {
    const healthCheckPackages = await this.healthCheckPackageRepository.find({
      where: { isActive: true },
      relations: {
        packagePrices: {
          fulfilmentMode: true,
        },
      },
      order: { name: 'ASC' },
    });

    const currentDate = new Date().toISOString().slice(0, 10);
    return healthCheckPackages.map((healthCheckPackage) =>
      HealthCheckPackageResponseDto.fromEntity(
        healthCheckPackage,
        this.filterActiveEffectivePrices(healthCheckPackage.packagePrices, currentDate),
      ),
    );
  }

  private filterActiveEffectivePrices(packagePrices: PackagePrice[], currentDate: string): PackagePrice[] {
    return packagePrices.filter(
      (packagePrice) =>
        packagePrice.isActive &&
        packagePrice.effectiveFrom <= currentDate &&
        (packagePrice.effectiveTo === null || packagePrice.effectiveTo > currentDate),
    );
  }
}
