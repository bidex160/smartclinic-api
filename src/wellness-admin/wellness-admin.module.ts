import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { WellnessPointAdjustment } from '../health-passport/engagement/wellness-point-adjustment.entity';
import { HealthPassportModule } from '../health-passport/health-passport.module';
import { Patient } from '../patients/entities/patient.entity';
import { RewardBookingRedemption } from '../rewards/entities/reward-booking-redemption.entity';
import { WellnessAdminController } from './wellness-admin.controller';
import { WellnessAdminService } from './wellness-admin.service';

@Module({
  imports: [AuthModule, HealthPassportModule, TypeOrmModule.forFeature([Patient, RewardBookingRedemption, WellnessPointAdjustment])],
  controllers: [WellnessAdminController],
  providers: [WellnessAdminService],
})
export class WellnessAdminModule {}
