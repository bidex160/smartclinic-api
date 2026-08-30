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
import { ProviderServiceUnitsModule } from '../provider-service-units/provider-service-units.module';
import { ClinicalOrderFulfillment } from './entities/clinical-order-fulfillment.entity';
import { ClinicalOrderFulfillmentHistory } from './entities/clinical-order-fulfillment-history.entity';
import { ClinicalOrderFulfillmentsService } from './clinical-order-fulfillments.service';
import { MeOrderFulfillmentsController, ProviderOrderFulfillmentsController } from './clinical-order-fulfillments.controller';
@Module({
  imports: [
    AuthModule,
    ProvidersModule,
    ProviderServiceUnitsModule,
    TypeOrmModule.forFeature([
      ClinicalOrder,
      ClinicalOrderStatusHistory,
      ClinicalPrescriptionDetail,
      ClinicalPrescriptionItem,
      CareAppointment,
      ClinicalRecord,
      Patient,
      User,
      ClinicalOrderFulfillment,
      ClinicalOrderFulfillmentHistory,
    ]),
  ],
  controllers: [ProviderClinicalOrdersController, MeClinicalOrdersController, ProviderOrderFulfillmentsController, MeOrderFulfillmentsController],
  providers: [ClinicalOrdersService, ClinicalOrderFulfillmentsService],
  exports: [ClinicalOrdersService],
})
export class ClinicalOrdersModule {}
