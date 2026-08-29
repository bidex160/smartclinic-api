import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { CareRequestStatusHistory } from "../care-requests/entities/care-request-status-history.entity";
import { CareRequest } from "../care-requests/entities/care-request.entity";
import { Patient } from "../patients/entities/patient.entity";
import { ProvidersModule } from "../providers/providers.module";
import { ProviderCareService } from "../providers/entities/provider-care-service.entity";
import { ProviderLocation } from "../providers/entities/provider-location.entity";
import { Provider } from "../providers/entities/provider.entity";
import { CareAppointmentStatusHistory } from "./entities/care-appointment-status-history.entity";
import { CareAppointment } from "./entities/care-appointment.entity";
import { CareAppointmentsService } from "./care-appointments.service";
import {
  MeCareAppointmentsController,
  ProviderCareAppointmentsController,
} from "./care-appointments.controller";
import { User } from "../users/entities/user.entity";
import { CareRequestFunding } from '../care-requests/entities/care-request-funding.entity';
import { EarningsModule } from '../earnings/earnings.module';
import { CareServiceDefinition } from '../providers/entities/care-service-definition.entity';
import { ClinicalRecord } from '../clinical-records/entities/clinical-record.entity';
import { ClinicalRecordsModule } from '../clinical-records/clinical-records.module';

@Module({
  imports: [
    AuthModule,
    ProvidersModule,
    EarningsModule,
    ClinicalRecordsModule,
    TypeOrmModule.forFeature([
      CareAppointment,
      CareAppointmentStatusHistory,
      CareRequest,
      CareRequestStatusHistory,
      Patient,
      Provider,
      ProviderCareService,
      ProviderLocation,
      User,
      CareRequestFunding,
      CareServiceDefinition,
      ClinicalRecord,
    ]),
  ],
  controllers: [
    ProviderCareAppointmentsController,
    MeCareAppointmentsController,
  ],
  providers: [CareAppointmentsService],
  exports: [CareAppointmentsService],
})
export class CareAppointmentsModule {}
