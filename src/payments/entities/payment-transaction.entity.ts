import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { PaymentTransactionStatus } from '../enums/payment-transaction-status.enum';
import { PaymentTransactionType } from '../enums/payment-transaction-type.enum';
import { PaymentAttempt } from './payment-attempt.entity';

@Entity('payment_transactions')
@Index('IDX_payment_transactions_attempt_status', ['paymentAttemptId', 'status'])
@Check('CHK_payment_transactions_amount_non_negative', '"amount" >= 0')
@Check('CHK_payment_transactions_currency_format', '"currency" ~ \'^[A-Z]{3}$\'')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'payment_attempt_id', type: 'uuid', nullable: true })
  paymentAttemptId!: string | null;

  @ManyToOne(() => PaymentAttempt, (attempt) => attempt.transactions, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_attempt_id' })
  paymentAttempt!: PaymentAttempt | null;

  @Column({ name: 'parent_transaction_id', type: 'uuid', nullable: true })
  parentTransactionId!: string | null;

  @ManyToOne(() => PaymentTransaction, (transaction) => transaction.refundTransactions, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parent_transaction_id' })
  parentTransaction!: PaymentTransaction | null;

  @OneToMany(() => PaymentTransaction, (transaction) => transaction.parentTransaction)
  refundTransactions!: PaymentTransaction[];

  @Column({ name: 'transaction_type', type: 'enum', enum: PaymentTransactionType, enumName: 'payment_transaction_type_enum' })
  transactionType!: PaymentTransactionType;

  @Column({ type: 'enum', enum: PaymentTransactionStatus, enumName: 'payment_transaction_status_enum' })
  status!: PaymentTransactionStatus;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'provider_reference', type: 'varchar', nullable: true })
  providerReference!: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz', nullable: true })
  occurredAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
