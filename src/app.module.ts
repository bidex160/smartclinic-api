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
