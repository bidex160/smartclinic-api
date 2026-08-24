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
@Module({
  imports: [
    AuthModule,
    ProvidersModule,
    TypeOrmModule.forFeature([
      PaymentAttempt,
      PaymentTransaction,
      Booking,
      BookingContact,
      BookingFunding,
      BookingStatusHistory,
      User
    ]),
  ],
  controllers: [AdminPaymentFlowController, PaystackWebhookController],
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
