import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FulfilmentMode } from './entities/fulfilment-mode.entity';
import { HealthCheckPackage } from './entities/health-check-package.entity';
import { PackagePrice } from './entities/package-price.entity';
import { FulfilmentModesController } from './fulfilment-modes.controller';
import { FulfilmentModesService } from './fulfilment-modes.service';
import { HealthCheckPackagesController } from './health-check-packages.controller';
import { HealthCheckPackagesService } from './health-check-packages.service';
import { PackagePricingService } from './package-pricing.service';

@Module({
  imports: [TypeOrmModule.forFeature([HealthCheckPackage, FulfilmentMode, PackagePrice])],
  controllers: [HealthCheckPackagesController, FulfilmentModesController],
  providers: [HealthCheckPackagesService, FulfilmentModesService, PackagePricingService],
  exports: [PackagePricingService],
})
export class HealthChecksModule {}
