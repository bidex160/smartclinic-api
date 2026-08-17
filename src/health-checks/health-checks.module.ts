import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';

import { FulfilmentMode } from './entities/fulfilment-mode.entity';
import { HealthCheckPackage } from './entities/health-check-package.entity';
import { PackagePrice } from './entities/package-price.entity';
import { FulfilmentModesController } from './fulfilment-modes.controller';
import { FulfilmentModesService } from './fulfilment-modes.service';
import { HealthCheckPackagesController } from './health-check-packages.controller';
import { HealthCheckPackagesService } from './health-check-packages.service';
import { PackagePricingService } from './package-pricing.service';
import { PackagePricesService } from './package-prices.service';
import { AdminPackagePricesController } from './admin-package-prices.controller';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([HealthCheckPackage, FulfilmentMode, PackagePrice])],
  controllers: [HealthCheckPackagesController, FulfilmentModesController, AdminPackagePricesController],
  providers: [HealthCheckPackagesService, FulfilmentModesService, PackagePricingService, PackagePricesService],
  exports: [PackagePricingService],
})
export class HealthChecksModule {}
