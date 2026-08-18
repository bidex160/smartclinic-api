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
import { ProvidersModule } from '../providers/providers.module';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatusHistory } from '../bookings/entities/booking-status-history.entity';
import { ProviderAssignment } from '../providers/entities/provider-assignment.entity';
import { HealthCheckEncounter } from './entities/health-check-encounter.entity';
import { HealthCheckMeasurement } from './entities/health-check-measurement.entity';
import { HealthCheckMeasurementHistory } from './entities/health-check-measurement-history.entity';
import { HealthCheckEncounterHistory } from './entities/health-check-encounter-history.entity';
import { ProviderHealthCheckEncountersService } from './provider-health-check-encounters.service';
import { ProviderHealthCheckEncountersController } from './provider-health-check-encounters.controller';
import { HealthResultAccessGrant } from './entities/health-result-access-grant.entity';
import { Patient } from '../patients/entities/patient.entity';
import { HealthResultAccessService } from './health-result-access.service';
import { MeHealthResultsController } from './me-health-results.controller';
import { AdminHealthResultAccessController } from './admin-health-result-access.controller';
import { PublicHealthResultsController } from './public-health-results.controller';
import { PatientHealthCheckHistoryService } from './patient-health-check-history.service';

@Module({
  imports: [AuthModule, ProvidersModule, TypeOrmModule.forFeature([HealthCheckPackage, FulfilmentMode, PackagePrice, Booking, BookingStatusHistory, ProviderAssignment, HealthCheckEncounter, HealthCheckMeasurement, HealthCheckMeasurementHistory, HealthCheckEncounterHistory, HealthResultAccessGrant, Patient])],
  controllers: [HealthCheckPackagesController, FulfilmentModesController, AdminPackagePricesController, ProviderHealthCheckEncountersController, MeHealthResultsController, AdminHealthResultAccessController, PublicHealthResultsController],
  providers: [HealthCheckPackagesService, FulfilmentModesService, PackagePricingService, PackagePricesService, ProviderHealthCheckEncountersService, HealthResultAccessService, PatientHealthCheckHistoryService],
  exports: [PackagePricingService, HealthResultAccessService],
})
export class HealthChecksModule {}
