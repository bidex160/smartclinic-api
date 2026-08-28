import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";

import { FulfilmentMode } from "./entities/fulfilment-mode.entity";
import { HealthCheckPackage } from "./entities/health-check-package.entity";
import { PackagePrice } from "./entities/package-price.entity";
import { FulfilmentModesController } from "./fulfilment-modes.controller";
import { FulfilmentModesService } from "./fulfilment-modes.service";
import { HealthCheckPackagesController } from "./health-check-packages.controller";
import { HealthCheckPackagesService } from "./health-check-packages.service";
import { ProvidersModule } from "../providers/providers.module";
import { Booking } from "../bookings/entities/booking.entity";
import { BookingStatusHistory } from "../bookings/entities/booking-status-history.entity";
import { ProviderAssignment } from "../providers/entities/provider-assignment.entity";
import { HealthCheckEncounter } from "./entities/health-check-encounter.entity";
import { HealthCheckMeasurement } from "./entities/health-check-measurement.entity";
import { HealthCheckMeasurementHistory } from "./entities/health-check-measurement-history.entity";
import { HealthCheckEncounterHistory } from "./entities/health-check-encounter-history.entity";
import { ProviderHealthCheckEncountersService } from "./provider-health-check-encounters.service";
import { ProviderHealthCheckEncountersController } from "./provider-health-check-encounters.controller";
import { HealthResultAccessGrant } from "./entities/health-result-access-grant.entity";
import { Patient } from "../patients/entities/patient.entity";
import { HealthResultAccessService } from "./health-result-access.service";
import { MeHealthResultsController } from "./me-health-results.controller";
import { AdminHealthResultAccessController } from "./admin-health-result-access.controller";
import { PublicHealthResultsController } from "./public-health-results.controller";
import { PatientHealthCheckHistoryService } from "./patient-health-check-history.service";
import { User } from "../users/entities/user.entity";
import { BookingFunding } from '../bookings/entities/booking-funding.entity';
import { PaymentAttempt } from '../payments/entities/payment-attempt.entity';
import { MePatientProfileController } from './me-patient-profile.controller';
import { PatientPortalProfileService } from './patient-portal-profile.service';
import { RewardsModule } from '../rewards/rewards.module';
import { EarningsModule } from '../earnings/earnings.module';

@Module({
  imports: [
    AuthModule,
    ProvidersModule,
    RewardsModule,
    EarningsModule,
    TypeOrmModule.forFeature([
      HealthCheckPackage,
      FulfilmentMode,
      PackagePrice,
      Booking,
      BookingStatusHistory,
      ProviderAssignment,
      HealthCheckEncounter,
      HealthCheckMeasurement,
      HealthCheckMeasurementHistory,
      HealthCheckEncounterHistory,
      HealthResultAccessGrant,
      Patient,
      User,
      BookingFunding,
      PaymentAttempt,
    ]),
  ],
  controllers: [
    HealthCheckPackagesController,
    FulfilmentModesController,
    ProviderHealthCheckEncountersController,
    MeHealthResultsController,
    AdminHealthResultAccessController,
    PublicHealthResultsController,
    MePatientProfileController,
  ],
  providers: [
    HealthCheckPackagesService,
    FulfilmentModesService,
    ProviderHealthCheckEncountersService,
    HealthResultAccessService,
    PatientHealthCheckHistoryService,
    PatientPortalProfileService,
  ],
  exports: [HealthResultAccessService],
})
export class HealthChecksModule {}
