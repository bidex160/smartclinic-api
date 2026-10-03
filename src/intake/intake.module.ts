import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CareAppointmentsModule } from '../care-appointments/care-appointments.module';
import { CareRequestsModule } from '../care-requests/care-requests.module';
import { Patient } from '../patients/entities/patient.entity';
import { MeIntakeController, ProviderIntakeController, PublicIntakeController } from './intake.controller';
import { SymptomIntake } from './intake.entity';
import { IntakeService } from './intake.service';

@Module({
  imports: [AuthModule, CareRequestsModule, CareAppointmentsModule, TypeOrmModule.forFeature([SymptomIntake, Patient])],
  controllers: [PublicIntakeController, MeIntakeController, ProviderIntakeController],
  providers: [IntakeService],
  exports: [IntakeService],
})
export class IntakeModule {}
