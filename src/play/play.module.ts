import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { NudgeSettings } from '../family/kids.entities';
import { HealthQuizAnswer } from '../health-passport/engagement/health-quiz-answer.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientDailyCheckIn } from '../patients/entities/patient-daily-check-in.entity';
import { PatientDailyRoutineCompletion } from '../patients/entities/patient-daily-routine-completion.entity';
import { Patient } from '../patients/entities/patient.entity';
import { RewardsModule } from '../rewards/rewards.module';
import { PlayActivityService } from './activity.service';
import { ChallengesService } from './challenges.service';
import { HealthWordService } from './health-word.service';
import { PlayController, PublicPlayController } from './play.controller';
import { HealthChallenge, HealthChallengeParticipant, HealthWordGame } from './play.entities';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    RewardsModule,
    TypeOrmModule.forFeature([
      Patient, PatientDailyCheckIn, PatientDailyRoutineCompletion, HealthQuizAnswer, NudgeSettings,
      HealthWordGame, HealthChallenge, HealthChallengeParticipant,
    ]),
  ],
  controllers: [PlayController, PublicPlayController],
  providers: [PlayActivityService, HealthWordService, ChallengesService],
  exports: [ChallengesService],
})
export class PlayModule {}
