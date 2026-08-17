import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';

@Module({ imports: [TypeOrmModule.forFeature([PaymentAttempt, PaymentTransaction])] })
export class PaymentsModule {}
