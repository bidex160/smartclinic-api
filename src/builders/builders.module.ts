import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RewardLevelDefinition } from '../rewards/entities/reward-level-definition.entity';
import { RewardsModule } from '../rewards/rewards.module';
import { BuildersController } from './builders.controller';
import { BuildersService } from './builders.service';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [AuthModule, RewardsModule, TypeOrmModule.forFeature([RewardLevelDefinition, User])],
  controllers: [BuildersController],
  providers: [BuildersService],
})
export class BuildersModule {}
