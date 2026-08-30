import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { CareAppointment } from "../care-appointments/entities/care-appointment.entity";
import { ClinicalRecord } from "../clinical-records/entities/clinical-record.entity";
import { Patient } from "../patients/entities/patient.entity";
import { ProvidersModule } from "../providers/providers.module";
import { ClinicalOrdersService } from "./clinical-orders.service";
import {
  MeClinicalOrdersController,
  ProviderClinicalOrdersController,
} from "./clinical-orders.controller";
import { ClinicalOrderStatusHistory } from "./entities/clinical-order-status-history.entity";
import { ClinicalOrder } from "./entities/clinical-order.entity";
import { ClinicalPrescriptionDetail } from "./entities/clinical-prescription-detail.entity";
import { ClinicalPrescriptionItem } from "./entities/clinical-prescription-item.entity";
import { User } from "src/users/entities/user.entity";
@Module({
  imports: [
    AuthModule,
    ProvidersModule,
    TypeOrmModule.forFeature([
      ClinicalOrder,
      ClinicalOrderStatusHistory,
      ClinicalPrescriptionDetail,
      ClinicalPrescriptionItem,
      CareAppointment,
      ClinicalRecord,
      Patient,
      User,
    ]),
  ],
  controllers: [ProviderClinicalOrdersController, MeClinicalOrdersController],
  providers: [ClinicalOrdersService],
  exports: [ClinicalOrdersService],
})
export class ClinicalOrdersModule {}
