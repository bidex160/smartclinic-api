import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FulfilmentMode } from './entities/fulfilment-mode.entity';
import { HealthCheckPackage } from './entities/health-check-package.entity';
import { FulfilmentModesController } from './fulfilment-modes.controller';
import { FulfilmentModesService } from './fulfilment-modes.service';
import { HealthCheckPackagesController } from './health-check-packages.controller';
import { HealthCheckPackagesService } from './health-check-packages.service';

@Module({
  imports: [TypeOrmModule.forFeature([HealthCheckPackage, FulfilmentMode])],
  controllers: [HealthCheckPackagesController, FulfilmentModesController],
  providers: [HealthCheckPackagesService, FulfilmentModesService],
})
export class HealthChecksModule {}
