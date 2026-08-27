import { BookingFunding } from "../../bookings/entities/booking-funding.entity";
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { PaymentAttemptStatus } from "../enums/payment-attempt-status.enum";
import { PaymentTransaction } from "./payment-transaction.entity";
import { FastTrackRequest } from '../../fasttrack/entities/fasttrack-request.entity';

@Entity("payment_attempts")
@Index("UQ_payment_attempts_idempotency_key", ["idempotencyKey"], {
  unique: true,
})
@Index(
  "UQ_payment_attempts_provider_reference",
  ["providerCode", "providerReference"],
  { unique: true, where: '"provider_reference" IS NOT NULL' },
)
@Index("IDX_payment_attempts_funding_status", ["bookingFundingId", "status"])
@Index("IDX_payment_attempts_fasttrack_status", ["fastTrackRequestId", "status"])
@Check('CHK_payment_attempts_obligation', '("booking_funding_id" IS NOT NULL AND "fasttrack_request_id" IS NULL) OR ("booking_funding_id" IS NULL AND "fasttrack_request_id" IS NOT NULL)')
@Check("CHK_payment_attempts_amount_non_negative", '"amount" >= 0')
@Check("CHK_payment_attempts_currency_format", "\"currency\" ~ '^[A-Z]{3}$'")
export class PaymentAttempt {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "booking_funding_id", type: "uuid", nullable: true })
  bookingFundingId!: string | null;

  @ManyToOne(() => BookingFunding, (funding) => funding.paymentAttempts, {
    nullable: true, onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "booking_funding_id" })
  bookingFunding!: BookingFunding | null;

  @Column({ name: 'fasttrack_request_id', type: 'uuid', nullable: true }) fastTrackRequestId!: string | null;
  @ManyToOne(() => FastTrackRequest, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'fasttrack_request_id' }) fastTrackRequest!: FastTrackRequest | null;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: "char", length: 3 })
  currency!: string;

  @Column({
    type: "enum",
    enum: PaymentAttemptStatus,
    enumName: "payment_attempt_status_enum",
    default: PaymentAttemptStatus.CREATED,
  })
  status!: PaymentAttemptStatus;

  @Column({ name: "idempotency_key", type: "varchar" })
  idempotencyKey!: string;

  @Column({ name: "provider_code", type: "varchar", nullable: true })
  providerCode!: string | null;

  @Column({ name: "provider_reference", type: "varchar", nullable: true })
  providerReference!: string | null;
  @Column({ name: "checkout_url", type: "text", nullable: true }) checkoutUrl!:
    | string
    | null;
  @Column({ name: "access_code", type: "text", nullable: true }) accessCode!:
    | string
    | null;

  @Column({ name: "last_verified_at", type: "timestamptz", nullable: true })
  lastVerifiedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(
    () => PaymentTransaction,
    (transaction) => transaction.paymentAttempt,
  )
  transactions!: PaymentTransaction[];
}
