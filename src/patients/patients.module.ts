import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { Booking } from "../bookings/entities/booking.entity";
import { CareRequest } from "../care-requests/entities/care-request.entity";
import { PatientProviderConnection } from "../patient-provider-connections/entities/patient-provider-connection.entity";
import { Patient } from "./entities/patient.entity";
import { MePatientDashboardController } from "./patient-dashboard.controller";
import { PatientDashboardService } from "./patient-dashboard.service";
import { PatientDashboardActionProjectionService } from "./patient-dashboard-action-projection.service";
import { User } from "../users/entities/user.entity";
import { PatientRelationship } from "./entities/patient-relationship.entity";
import { DependantRewardProvenance } from "./entities/dependant-reward-provenance.entity";
import { PatientAccessService } from "./patient-access.service";
import { DependantsService } from "./dependants.service";
import { MeDependantsController } from "./dependants.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { PatientDailyCheckIn } from "./entities/patient-daily-check-in.entity";
import { PatientDailyRoutineCompletion } from "./entities/patient-daily-routine-completion.entity";
import { PatientDailyCheckInsController } from "./patient-daily-check-ins.controller";
import { PatientDailyCheckInsService } from "./patient-daily-check-ins.service";
import { PatientDailyRoutine } from "./entities/patient-daily-routine.entity";
import { PatientDailyRoutineCompletionsService } from "./patient-daily-routine-completions.service";
import { PatientDailyRoutinesController } from "./patient-daily-routines.controller";
import { PatientDailyRoutinesService } from "./patient-daily-routines.service";
import { PatientDailyRoutineNotificationScheduler } from "./patient-daily-routine-notification.scheduler";

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Patient,
      PatientProviderConnection,
      CareRequest,
      Booking,
      User,
      PatientRelationship,
      DependantRewardProvenance,
      PatientDailyRoutine,
      PatientDailyRoutineCompletion,
      PatientDailyCheckIn,
    ]),
  ],
  controllers: [
    MePatientDashboardController,
    MeDependantsController,
    PatientDailyRoutinesController,
    PatientDailyCheckInsController,
  ],
  providers: [
    PatientDashboardService,
    PatientDashboardActionProjectionService,
    PatientAccessService,
    DependantsService,
    PatientDailyRoutinesService,
    PatientDailyRoutineCompletionsService,
    PatientDailyCheckInsService,
    PatientDailyRoutineNotificationScheduler,
  ],
  exports: [PatientAccessService],
})
export class PatientsModule {}
