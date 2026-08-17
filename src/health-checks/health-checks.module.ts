import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FulfilmentMode } from './entities/fulfilment-mode.entity';
import { HealthCheckPackage } from './entities/health-check-package.entity';

@Module({ imports: [TypeOrmModule.forFeature([HealthCheckPackage, FulfilmentMode])] })
export class HealthChecksModule {}
