import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { HealthCheckEncounter } from '../health-checks/entities/health-check-encounter.entity';
import { Provider } from '../providers/entities/provider.entity';
import { ReferralCode } from './entities/referral-code.entity';
import { Referral } from './entities/referral.entity';
import { RewardConversionRate } from './entities/reward-conversion-rate.entity';
import { RewardLevelAchievement } from './entities/reward-level-achievement.entity';
import { RewardLevelDefinition } from './entities/reward-level-definition.entity';
import { RewardLevelRequirement } from './entities/reward-level-requirement.entity';
import { RewardPointsLedger } from './entities/reward-points-ledger.entity';
import { RewardRule } from './entities/reward-rule.entity';
import { AdminReferralsController, MeReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { User } from 'src/users/entities/user.entity';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([ReferralCode, Referral, RewardPointsLedger, RewardRule, RewardLevelDefinition, RewardLevelRequirement, RewardLevelAchievement, RewardConversionRate, Provider, HealthCheckEncounter, User]),
  ],
  controllers: [MeReferralsController, AdminReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class RewardsModule {}
