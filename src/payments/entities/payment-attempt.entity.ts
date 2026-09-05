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
import { CareRequestFunding } from '../../care-requests/entities/care-request-funding.entity';
import { PatientProviderConnectionFunding } from '../../patient-provider-connections/entities/patient-provider-connection-funding.entity';
import { PharmacyFulfillmentFunding } from '../../clinical-orders/entities/pharmacy-fulfillment-funding.entity';
import { GuidedSelfCheck } from '../../guided-self-checks/entities/guided-self-check.entity';

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
@Index("IDX_payment_attempts_care_request_funding_status", ["careRequestFundingId", "status"])
@Index("IDX_payment_attempts_patient_connection_funding_status", ["patientProviderConnectionFundingId", "status"])
@Index("IDX_payment_attempts_pharmacy_funding_status", ["pharmacyFulfillmentFundingId", "status"])
@Index("IDX_payment_attempts_guided_self_check_status", ["guidedSelfCheckId", "status"])
@Check('CHK_payment_attempts_obligation', '(CASE WHEN "booking_funding_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "fasttrack_request_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "care_request_funding_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "patient_provider_connection_funding_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "pharmacy_fulfillment_funding_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "guided_self_check_id" IS NULL THEN 0 ELSE 1 END) = 1')
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

  @Column({ name: 'care_request_funding_id', type: 'uuid', nullable: true }) careRequestFundingId!: string | null;
  @ManyToOne(() => CareRequestFunding, funding => funding.paymentAttempts, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'care_request_funding_id' }) careRequestFunding!: CareRequestFunding | null;

  @Column({ name: 'patient_provider_connection_funding_id', type: 'uuid', nullable: true }) patientProviderConnectionFundingId!: string | null;
  @ManyToOne(() => PatientProviderConnectionFunding, funding => funding.paymentAttempts, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_provider_connection_funding_id' }) patientProviderConnectionFunding!: PatientProviderConnectionFunding | null;
  @Column({name:'pharmacy_fulfillment_funding_id',type:'uuid',nullable:true})pharmacyFulfillmentFundingId!:string|null;
  @ManyToOne(()=>PharmacyFulfillmentFunding,f=>f.paymentAttempts,{nullable:true,onDelete:'RESTRICT'})@JoinColumn({name:'pharmacy_fulfillment_funding_id'})pharmacyFulfillmentFunding!:PharmacyFulfillmentFunding|null;
  @Column({name:'guided_self_check_id',type:'uuid',nullable:true}) guidedSelfCheckId!:string|null;
  @ManyToOne(()=>GuidedSelfCheck,{nullable:true,onDelete:'RESTRICT'}) @JoinColumn({name:'guided_self_check_id'}) guidedSelfCheck!:GuidedSelfCheck|null;

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

  @Column({ name: "customer_email", type: "varchar", length: 254, nullable: true })
  customerEmail!: string | null;

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
