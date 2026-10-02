import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { HealthQuizAnswer } from '../health-passport/engagement/health-quiz-answer.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientDailyCheckIn } from '../patients/entities/patient-daily-check-in.entity';
import { PatientDailyRoutineCompletion } from '../patients/entities/patient-daily-routine-completion.entity';
import { PatientHealthBasics } from '../patients/entities/patient-health-basics.entity';
import { PatientRelationship } from '../patients/entities/patient-relationship.entity';
import { Patient } from '../patients/entities/patient.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { FamilyKidsController } from './family-kids.controller';
import { FamilyKidsService } from './family-kids.service';
import { ChildDailyTask, ChildQuizAnswer, ChildTaskCompletion, NudgeSettings } from './kids.entities';
import { NudgesController } from './nudges.controller';
import { NudgesService } from './nudges.service';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    WhatsAppModule,
    TypeOrmModule.forFeature([
      Patient, PatientRelationship, PatientHealthBasics, PatientDailyCheckIn, PatientDailyRoutineCompletion, HealthQuizAnswer,
      ChildDailyTask, ChildTaskCompletion, ChildQuizAnswer, NudgeSettings,
    ]),
  ],
  controllers: [FamilyKidsController, NudgesController],
  providers: [FamilyKidsService, NudgesService],
})
export class FamilyModule {}
