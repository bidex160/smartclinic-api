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

@Module({
  imports: [
    AuthModule,
    ProvidersModule,
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
