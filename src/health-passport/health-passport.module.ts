import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CareAppointment } from '../care-appointments/entities/care-appointment.entity';
import { ClinicalOrder } from '../clinical-orders/entities/clinical-order.entity';
import { PharmacyDispensing } from '../clinical-orders/entities/pharmacy-dispensing.entity';
import { ClinicalRecord } from '../clinical-records/entities/clinical-record.entity';
import { GuidedSelfCheckAnswer } from '../guided-self-checks/entities/guided-self-check-answer.entity';
import { GuidedSelfCheckClassificationResult } from '../guided-self-checks/entities/guided-self-check-classification.entity';
import { GuidedSelfCheckNextAction } from '../guided-self-checks/entities/guided-self-check-next-action.entity';
import { GuidedSelfCheckProfessionalReview } from '../guided-self-checks/entities/guided-self-check-professional-review.entity';
import { GuidedSelfCheck } from '../guided-self-checks/entities/guided-self-check.entity';
import { GuidedSelfChecksModule } from '../guided-self-checks/guided-self-checks.module';
import { HealthCheckEncounter } from '../health-checks/entities/health-check-encounter.entity';
import { HealthCheckMeasurement } from '../health-checks/entities/health-check-measurement.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientDailyCheckIn } from '../patients/entities/patient-daily-check-in.entity';
import { PatientDailyRoutineCompletion } from '../patients/entities/patient-daily-routine-completion.entity';
import { PatientDailyRoutine } from '../patients/entities/patient-daily-routine.entity';
import { PatientHealthBasics } from '../patients/entities/patient-health-basics.entity';
import { PatientRelationship } from '../patients/entities/patient-relationship.entity';
import { EngagementController } from './engagement/engagement.controller';
import { EngagementService } from './engagement/engagement.service';
import { HealthQuizAnswer } from './engagement/health-quiz-answer.entity';
import { WellnessPointsService } from './engagement/wellness-points.service';
import { WellnessPointAdjustment } from './engagement/wellness-point-adjustment.entity';
import { AppSetting } from './engagement/app-setting.entity';
import { RewardBookingRedemption } from '../rewards/entities/reward-booking-redemption.entity';
import { HealthPassportController } from './health-passport.controller';
import { HealthPassportService } from './health-passport.service';
import { User } from '../users/entities/user.entity';
import { HealthChallengeParticipant, HealthWordGame } from '../play/play.entities';

@Module({
  imports: [
    AuthModule,
    GuidedSelfChecksModule,
    TypeOrmModule.forFeature([
      Patient,
      GuidedSelfCheck,
      GuidedSelfCheckAnswer,
      GuidedSelfCheckClassificationResult,
      GuidedSelfCheckProfessionalReview,
      GuidedSelfCheckNextAction,
      HealthCheckEncounter,
      HealthCheckMeasurement,
      CareAppointment,
      ClinicalRecord,
      ClinicalOrder,
      PharmacyDispensing,
      User,
      PatientHealthBasics,
      PatientDailyRoutine,
      PatientDailyRoutineCompletion,
      PatientDailyCheckIn,
      PatientRelationship,
      HealthQuizAnswer,
      RewardBookingRedemption,
      WellnessPointAdjustment,
      AppSetting,
      HealthWordGame,
      HealthChallengeParticipant,
    ]),
  ],
  controllers: [HealthPassportController, EngagementController],
  providers: [HealthPassportService, EngagementService, WellnessPointsService],
  exports: [HealthPassportService, WellnessPointsService],
})
export class HealthPassportModule {}
