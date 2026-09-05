import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { EmailModule } from '../notifications/email/email.module';
import { ProviderRecruitmentInvitation } from './entities/provider-recruitment-invitation.entity';
import { ProviderRecruitmentInvitationsController } from './provider-recruitment-invitations.controller';
import { ProviderRecruitmentInvitationsService } from './provider-recruitment-invitations.service';
import { User } from 'src/users/entities/user.entity';

@Module({
  imports: [AuthModule, EmailModule, TypeOrmModule.forFeature([ProviderRecruitmentInvitation, HealthCheckPackage, FulfilmentMode, User])],
  controllers: [ProviderRecruitmentInvitationsController],
  providers: [ProviderRecruitmentInvitationsService],
})
export class ProviderRecruitmentInvitationsModule {}
