import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';

import { CareAppointmentsModule } from '../care-appointments/care-appointments.module';
import { ClinicalOrdersModule } from '../clinical-orders/clinical-orders.module';
import { IntakeModule } from '../intake/intake.module';
import { ProvidersModule } from '../providers/providers.module';
import { DoctorCompanionController } from './doctor-companion.controller';
import { DoctorCompanionService } from './doctor-companion.service';

@Module({
  imports: [AuthModule, ProvidersModule, CareAppointmentsModule, ClinicalOrdersModule, IntakeModule],
  controllers: [DoctorCompanionController],
  providers: [DoctorCompanionService],
})
export class DoctorCompanionModule {}
