import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { BookingContact } from '../bookings/entities/booking-contact.entity';
import { AuthModule } from '../auth/auth.module'; import { Booking } from '../bookings/entities/booking.entity'; import { BookingFunding } from '../bookings/entities/booking-funding.entity'; import { BookingStatusHistory } from '../bookings/entities/booking-status-history.entity'; import { AdminPaymentFlowController } from './admin-payment-flow.controller'; import { PaymentFlowService } from './payment-flow.service'; import { PAYMENT_PROVIDER_ADAPTER } from './payment-provider.adapter'; import { TestPaymentProviderAdapter } from './adapters/test-payment-provider.adapter'; import { UnavailablePaymentProviderAdapter } from './adapters/unavailable-payment-provider.adapter';

@Module({ imports: [AuthModule, TypeOrmModule.forFeature([PaymentAttempt, PaymentTransaction, Booking, BookingContact, BookingFunding, BookingStatusHistory])], controllers:[AdminPaymentFlowController], providers:[PaymentFlowService,TestPaymentProviderAdapter,{provide:PAYMENT_PROVIDER_ADAPTER,useFactory:(test:TestPaymentProviderAdapter)=>process.env.NODE_ENV==='production'?new UnavailablePaymentProviderAdapter():test,inject:[TestPaymentProviderAdapter]}], exports:[PaymentFlowService] })
export class PaymentsModule {}
