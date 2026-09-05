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
import { HealthPassportController } from './health-passport.controller';
import { HealthPassportService } from './health-passport.service';
import { User } from 'src/users/entities/user.entity';

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
    ]),
  ],
  controllers: [HealthPassportController],
  providers: [HealthPassportService],
  exports: [HealthPassportService],
})
export class HealthPassportModule {}
