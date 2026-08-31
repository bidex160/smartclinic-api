import { Module } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { BookingContact } from "../bookings/entities/booking-contact.entity";
import { BookingFunding } from "../bookings/entities/booking-funding.entity";
import { BookingStatusHistory } from "../bookings/entities/booking-status-history.entity";
import { Booking } from "../bookings/entities/booking.entity";
import { appConfig } from "../config/app.config";
import { AdminPaymentFlowController } from "./admin-payment-flow.controller";
import { PaystackPaymentProviderAdapter } from "./adapters/paystack-payment-provider.adapter";
import { TestPaymentProviderAdapter } from "./adapters/test-payment-provider.adapter";
import { UnavailablePaymentProviderAdapter } from "./adapters/unavailable-payment-provider.adapter";
import { PaymentAttempt } from "./entities/payment-attempt.entity";
import { PaymentTransaction } from "./entities/payment-transaction.entity";
import { PaymentFlowService } from "./payment-flow.service";
import { PAYMENT_PROVIDER_ADAPTER } from "./payment-provider.adapter";
import { PaystackWebhookController } from "./paystack-webhook.controller";
import { User } from "../users/entities/user.entity";
import { ProvidersModule } from "../providers/providers.module";
import { RewardsModule } from "../rewards/rewards.module";
import { RewardBookingRedemption } from "../rewards/entities/reward-booking-redemption.entity";
import { RewardConversionRate } from "../rewards/entities/reward-conversion-rate.entity";
import { RewardPointsLedger } from "../rewards/entities/reward-points-ledger.entity";
import { FastTrackRequest } from '../fasttrack/entities/fasttrack-request.entity';
import { FastTrackRequestStatusHistory } from '../fasttrack/entities/fasttrack-request-status-history.entity';
import { EarningsModule } from '../earnings/earnings.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { CareRequestFunding } from '../care-requests/entities/care-request-funding.entity';
import { MeCareRequestFundingController } from './me-care-request-funding.controller';
import { PatientProviderConnection } from '../patient-provider-connections/entities/patient-provider-connection.entity';
import { PatientProviderConnectionFunding } from '../patient-provider-connections/entities/patient-provider-connection-funding.entity';
import { PatientProviderConnectionHistory } from '../patient-provider-connections/entities/patient-provider-connection-history.entity';
import { PharmacyFulfillmentFunding } from '../clinical-orders/entities/pharmacy-fulfillment-funding.entity';import { PharmacyQuote } from '../clinical-orders/entities/pharmacy-quote.entity';import { ClinicalOrderFulfillment } from '../clinical-orders/entities/clinical-order-fulfillment.entity';import { PharmacyDispensing } from '../clinical-orders/entities/pharmacy-dispensing.entity';import { Patient } from '../patients/entities/patient.entity';import { MePharmacyFundingController } from './me-pharmacy-funding.controller'; import { GuidedSelfCheck } from '../guided-self-checks/entities/guided-self-check.entity'; import { GuidedSelfCheckHistory } from '../guided-self-checks/entities/guided-self-check-history.entity'; import { MeGuidedSelfCheckFundingController } from './me-guided-self-check-funding.controller';
@Module({
  imports: [
    AuthModule,
    ProvidersModule,
    RewardsModule,
    EarningsModule,
    CommissionsModule,
    TypeOrmModule.forFeature([
      PaymentAttempt,
      PaymentTransaction,
      Booking,
      BookingContact,
      BookingFunding,
      BookingStatusHistory,
      User
      ,RewardBookingRedemption,
      RewardConversionRate,
      RewardPointsLedger
      ,FastTrackRequest,
      FastTrackRequestStatusHistory
      ,CareRequest,
      CareRequestFunding
      ,PatientProviderConnection,
      PatientProviderConnectionFunding,
      PatientProviderConnectionHistory
      ,PharmacyFulfillmentFunding,PharmacyQuote,ClinicalOrderFulfillment,PharmacyDispensing,Patient,GuidedSelfCheck,GuidedSelfCheckHistory
    ]),
  ],
  controllers: [AdminPaymentFlowController, PaystackWebhookController, MeCareRequestFundingController,MePharmacyFundingController,MeGuidedSelfCheckFundingController],
  providers: [
    PaymentFlowService,
    TestPaymentProviderAdapter,
    PaystackPaymentProviderAdapter,
    {
      provide: PAYMENT_PROVIDER_ADAPTER,
      useFactory: (
        config: ConfigType<typeof appConfig>,
        test: TestPaymentProviderAdapter,
        paystack: PaystackPaymentProviderAdapter,
      ) =>
        config.payments.provider === "paystack"
          ? paystack
          : config.payments.provider === "test"
            ? test
            : new UnavailablePaymentProviderAdapter(),
      inject: [
        appConfig.KEY,
        TestPaymentProviderAdapter,
        PaystackPaymentProviderAdapter,
      ],
    },
  ],
  exports: [PaymentFlowService],
})
export class PaymentsModule {}
