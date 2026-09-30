import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ClinicalOrder } from "../clinical-orders/entities/clinical-order.entity";
import { ClinicalOrderFulfillment } from "../clinical-orders/entities/clinical-order-fulfillment.entity";
import { DiagnosticFulfillmentFunding } from "../clinical-orders/entities/diagnostic-fulfillment-funding.entity";
import { PharmacyFulfillmentFunding } from "../clinical-orders/entities/pharmacy-fulfillment-funding.entity";
import { PharmacyCoordinationAllocation } from "../clinical-orders/entities/pharmacy-coordination-allocation.entity";
import { DiagnosticExecution } from "../clinical-orders/entities/diagnostic-execution.entity";
import { PharmacyDispensing } from "../clinical-orders/entities/pharmacy-dispensing.entity";
import { HospitalCompanionService } from "./hospital-companion.service";
import {
  HospitalServicePass,
  HospitalServicePassStatus,
} from "./entities/hospital-service-pass.entity";
import { HospitalServicePassService } from "./hospital-service-pass.service";
import { AuthModule } from "../auth/auth.module";
import { WalletModule } from "../wallet/wallet.module";
import { HospitalWalletSettlementService } from "./hospital-wallet-settlement.service";
import { EarningsModule } from "../earnings/earnings.module";
import { Patient } from "../patients/entities/patient.entity";
import { PaymentsModule } from "../payments/payments.module";
import { Provider } from "../providers/entities/provider.entity";
import { ProvidersModule } from "../providers/providers.module";
import { User } from "../users/entities/user.entity";
import { RewardsModule } from "../rewards/rewards.module";
import { PatientProviderConnectionFunding } from "./entities/patient-provider-connection-funding.entity";
import { PatientProviderConnectionHistory } from "./entities/patient-provider-connection-history.entity";
import { PatientProviderConnection } from "./entities/patient-provider-connection.entity";
import {
  MePatientProviderConnectionsController,
  ProviderPatientConnectionsController,
  AdminPartnerFacilityDirectoryController,
  ProviderPartnerFacilityDirectoryController,
} from "./patient-provider-connections.controller";
import { PatientProviderConnectionsService } from "./patient-provider-connections.service";
import { PartnerFacilityListing } from './entities/partner-facility-listing.entity';
import { PartnerFacilityInterest } from './entities/partner-facility-interest.entity';
import { PartnerFacilityRequest } from './entities/partner-facility-request.entity';
import { PartnerFacilityDirectoryService } from './partner-facility-directory.service';
@Module({
  imports: [
    AuthModule,
    WalletModule,
    ProvidersModule,
    EarningsModule,
    PaymentsModule,
    RewardsModule,
    TypeOrmModule.forFeature([
      PatientProviderConnection,
      PatientProviderConnectionFunding,
      PatientProviderConnectionHistory,
      Patient,
      Provider,
      User,
      ClinicalOrder,
      ClinicalOrderFulfillment,
      DiagnosticFulfillmentFunding,
      PharmacyFulfillmentFunding,
      PharmacyCoordinationAllocation,
      DiagnosticExecution,
      PharmacyDispensing,
      HospitalServicePass,
      PartnerFacilityListing,
      PartnerFacilityInterest,
      PartnerFacilityRequest,
    ]),
  ],
  controllers: [
    MePatientProviderConnectionsController,
    ProviderPatientConnectionsController,
    AdminPartnerFacilityDirectoryController,
    ProviderPartnerFacilityDirectoryController,
  ],
  providers: [
    PatientProviderConnectionsService,
    HospitalCompanionService,
    HospitalServicePassService,
    HospitalWalletSettlementService,
    PartnerFacilityDirectoryService,
  ],
  exports: [PatientProviderConnectionsService, HospitalServicePassService],
})
export class PatientProviderConnectionsModule {}
