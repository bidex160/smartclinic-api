import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Booking } from '../bookings/entities/booking.entity';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { PatientProviderConnection } from '../patient-provider-connections/entities/patient-provider-connection.entity';
import { Patient } from './entities/patient.entity';
import { MePatientDashboardController } from './patient-dashboard.controller';
import { PatientDashboardService } from './patient-dashboard.service';
import { PatientDashboardActionProjectionService } from './patient-dashboard-action-projection.service';
import { User } from 'src/users/entities/user.entity';
import { PatientRelationship } from './entities/patient-relationship.entity';
import { DependantRewardProvenance } from './entities/dependant-reward-provenance.entity';
import { PatientAccessService } from './patient-access.service';
import { DependantsService } from './dependants.service';
import { MeDependantsController } from './dependants.controller';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      Patient,
      PatientProviderConnection,
      CareRequest,
      Booking,
      User,
      PatientRelationship,
      DependantRewardProvenance,
    ]),
  ],
  controllers: [MePatientDashboardController, MeDependantsController],
  providers: [PatientDashboardService, PatientDashboardActionProjectionService, PatientAccessService, DependantsService],
  exports: [PatientAccessService],
})
export class PatientsModule {}
