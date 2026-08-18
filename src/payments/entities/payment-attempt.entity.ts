import { BookingFunding } from '../../bookings/entities/booking-funding.entity';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { PaymentAttemptStatus } from '../enums/payment-attempt-status.enum';
import { PaymentTransaction } from './payment-transaction.entity';

@Entity('payment_attempts')
@Index('UQ_payment_attempts_idempotency_key', ['idempotencyKey'], { unique: true })
@Index('UQ_payment_attempts_provider_reference', ['providerCode', 'providerReference'], { unique: true, where: '"provider_reference" IS NOT NULL' })
@Index('IDX_payment_attempts_funding_status', ['bookingFundingId', 'status'])
@Check('CHK_payment_attempts_amount_non_negative', '"amount" >= 0')
@Check('CHK_payment_attempts_currency_format', '"currency" ~ \'^[A-Z]{3}$\'')
export class PaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_funding_id', type: 'uuid' })
  bookingFundingId!: string;

  @ManyToOne(() => BookingFunding, (funding) => funding.paymentAttempts, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'booking_funding_id' })
  bookingFunding!: BookingFunding;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'enum', enum: PaymentAttemptStatus, enumName: 'payment_attempt_status_enum', default: PaymentAttemptStatus.CREATED })
  status!: PaymentAttemptStatus;

  @Column({ name: 'idempotency_key', type: 'varchar' })
  idempotencyKey!: string;

  @Column({ name: 'provider_code', type: 'varchar', nullable: true })
  providerCode!: string | null;

  @Column({ name: 'provider_reference', type: 'varchar', nullable: true })
  providerReference!: string | null;
  @Column({ name: 'checkout_url', type: 'text', nullable: true }) checkoutUrl!: string | null;

  @Column({ name: 'last_verified_at', type: 'timestamptz', nullable: true })
  lastVerifiedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => PaymentTransaction, (transaction) => transaction.paymentAttempt)
  transactions!: PaymentTransaction[];
}
