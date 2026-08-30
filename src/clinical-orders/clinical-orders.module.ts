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
import { PharmacyQuote } from './entities/pharmacy-quote.entity';import { PharmacyQuoteItem } from './entities/pharmacy-quote-item.entity';import { PharmacyFulfillmentFunding } from './entities/pharmacy-fulfillment-funding.entity';import { PharmacyDispensing } from './entities/pharmacy-dispensing.entity';import { PharmacyFulfillmentService } from './pharmacy-fulfillment.service';import { MePharmacyFulfillmentController,ProviderPharmacyFulfillmentController } from './pharmacy-fulfillment.controller';import { CommissionsModule } from '../commissions/commissions.module';import { EarningsModule } from '../earnings/earnings.module';
@Module({
  imports: [
    AuthModule,
    ProvidersModule,
    ProviderServiceUnitsModule,
    CommissionsModule,EarningsModule,
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
      PharmacyQuote,PharmacyQuoteItem,PharmacyFulfillmentFunding,PharmacyDispensing,
    ]),
  ],
  controllers: [ProviderClinicalOrdersController, MeClinicalOrdersController, ProviderOrderFulfillmentsController, MeOrderFulfillmentsController,ProviderPharmacyFulfillmentController,MePharmacyFulfillmentController],
  providers: [ClinicalOrdersService, ClinicalOrderFulfillmentsService,PharmacyFulfillmentService],
  exports: [ClinicalOrdersService],
})
export class ClinicalOrdersModule {}
