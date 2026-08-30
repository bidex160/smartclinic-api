import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { BookingsModule } from './bookings/bookings.module';
import { appConfig } from './config/app.config';
import { createAppConfiguration } from './config/environment';
import { validateEnvironment } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { HealthChecksModule } from './health-checks/health-checks.module';
import { OrganisationsModule } from './organisations/organisations.module';
import { PatientsModule } from './patients/patients.module';
import { PaymentsModule } from './payments/payments.module';
import { ProvidersModule } from './providers/providers.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { RewardsModule } from './rewards/rewards.module';
import { CareRequestsModule } from './care-requests/care-requests.module';
import { FastTrackModule } from './fasttrack/fasttrack.module';
import { CareAppointmentsModule } from './care-appointments/care-appointments.module';
import { CareChatModule } from './care-chat/care-chat.module';
import { CommissionsModule } from './commissions/commissions.module';
import { EarningsModule } from './earnings/earnings.module';
import { ClinicalRecordsModule } from './clinical-records/clinical-records.module';
import { PatientProviderConnectionsModule } from './patient-provider-connections/patient-provider-connections.module';
import { ClinicalOrdersModule } from './clinical-orders/clinical-orders.module';

const configuration = createAppConfiguration();
const persistenceDomainModules = configuration.database.enabled
  ? [
      UsersModule,
      PatientsModule,
      OrganisationsModule,
      HealthChecksModule,
      BookingsModule,
      PaymentsModule,
      ProvidersModule,
      AuthModule,
      RewardsModule,
      CareRequestsModule,
      FastTrackModule,
      CareAppointmentsModule,
      CareChatModule,
      CommissionsModule,
      EarningsModule,
      ClinicalRecordsModule,
      PatientProviderConnectionsModule,
      ClinicalOrdersModule,
    ]
  : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    ...persistenceDomainModules,
    HealthModule,
  ],
})
export class AppModule {}
