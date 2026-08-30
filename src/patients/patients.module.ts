import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Booking } from '../bookings/entities/booking.entity';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { PatientProviderConnection } from '../patient-provider-connections/entities/patient-provider-connection.entity';
import { Patient } from './entities/patient.entity';
import { MePatientDashboardController } from './patient-dashboard.controller';
import { PatientDashboardService } from './patient-dashboard.service';
import { User } from 'src/users/entities/user.entity';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      Patient,
      PatientProviderConnection,
      CareRequest,
      Booking,
      User,
    ]),
  ],
  controllers: [MePatientDashboardController],
  providers: [PatientDashboardService],
})
export class PatientsModule {}
