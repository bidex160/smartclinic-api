import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientRelationship } from '../patients/entities/patient-relationship.entity';
import { Patient } from '../patients/entities/patient.entity';
import { CurrentProviderService } from '../providers/current-provider.service';
import { ProviderMember } from '../providers/entities/provider-member.entity';
import { Provider } from '../providers/entities/provider.entity';
import { CheckupPlan, CheckupVoucher, FreeCheckPartner, VitalReading } from './checkup.entities';
import { AdminCheckupsController, MeCheckupController, ProviderFreeChecksController, PublicFreeChecksController } from './checkups.controller';
import { CheckupsService } from './checkups.service';
import { FreeChecksService } from './free-checks.service';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    TypeOrmModule.forFeature([VitalReading, CheckupPlan, CheckupVoucher, FreeCheckPartner, Patient, PatientRelationship, Provider, ProviderMember]),
  ],
  controllers: [MeCheckupController, ProviderFreeChecksController, PublicFreeChecksController, AdminCheckupsController],
  providers: [CheckupsService, FreeChecksService, CurrentProviderService],
  exports: [CheckupsService, TypeOrmModule],
})
export class CheckupsModule {}
