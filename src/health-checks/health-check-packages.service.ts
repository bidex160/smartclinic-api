import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { HealthCheckPackageResponseDto } from './dto/health-check-package-response.dto';
import { HealthCheckPackage } from './entities/health-check-package.entity';

@Injectable()
export class HealthCheckPackagesService {
  constructor(
    @InjectRepository(HealthCheckPackage)
    private readonly healthCheckPackageRepository: Repository<HealthCheckPackage>,
  ) {}

  async findActive(): Promise<HealthCheckPackageResponseDto[]> {
    const healthCheckPackages = await this.healthCheckPackageRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    return healthCheckPackages.map(HealthCheckPackageResponseDto.fromEntity);
  }
}
