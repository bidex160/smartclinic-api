import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CommissionRateSource } from "../../commissions/enums/commission-rate-source.enum";
import { PaymentAttempt } from "../../payments/entities/payment-attempt.entity";
import { Provider } from "../../providers/entities/provider.entity";
import { User } from "../../users/entities/user.entity";
import {
  PharmacyFundingStatus,
  PharmacyFulfillmentMethod,
} from "../enums/pharmacy-quote-status.enum";
import { ClinicalOrderFulfillment } from "./clinical-order-fulfillment.entity";
import { PharmacyQuote } from "./pharmacy-quote.entity";

export interface PharmacyDeliveryAddressSnapshot {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateOrRegion: string;
  countryCode: string;
  contactPhone: string;
}

@Entity("pharmacy_fulfillment_fundings")
@Index("UQ_pharmacy_funding_quote", ["quoteId"], { unique: true })
@Index("IDX_pharmacy_funding_fulfillment_status", ["fulfillmentId", "status"])
@Check(
  "CHK_pharmacy_funding_money",
  '"medicine_amount_minor" >= 0 AND "delivery_fee_minor" >= 0 AND "gross_amount_minor" = "medicine_amount_minor" + "delivery_fee_minor" + "doctor_coordination_amount_minor" + "hospital_coordination_amount_minor" AND "commission_amount_minor" >= 0 AND "provider_share_minor" >= 0 AND "commission_amount_minor" + "provider_share_minor" = "medicine_amount_minor" + "delivery_fee_minor"',
)
@Check(
  "CHK_pharmacy_funding_coordination",
  '"doctor_coordination_bps" BETWEEN 0 AND 10000 AND "hospital_coordination_bps" BETWEEN 0 AND 10000 AND "doctor_coordination_amount_minor" >= 0 AND "hospital_coordination_amount_minor" >= 0 AND (("hospital_coordination_amount_minor" = 0 AND "hospital_beneficiary_provider_id" IS NULL) OR ("hospital_coordination_amount_minor" > 0 AND "hospital_beneficiary_provider_id" IS NOT NULL))',
)
export class PharmacyFulfillmentFunding {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "quote_id", type: "uuid" }) quoteId!: string;
  @OneToOne(() => PharmacyQuote, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "quote_id" })
  quote!: PharmacyQuote;
  @Column({ name: "fulfillment_id", type: "uuid" }) fulfillmentId!: string;
  @ManyToOne(() => ClinicalOrderFulfillment, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "fulfillment_id" })
  fulfillment!: ClinicalOrderFulfillment;
  @Column({ name: "provider_id", type: "uuid" }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "provider_id" })
  provider!: Provider;
  @Column({ name: "medicine_amount_minor", type: "bigint" })
  medicineAmountMinor!: string;
  @Column({ name: "delivery_fee_minor", type: "bigint" })
  deliveryFeeMinor!: string;
  @Column({ name: "doctor_coordination_bps", type: "smallint" })
  doctorCoordinationBps!: number;
  @Column({ name: "doctor_coordination_amount_minor", type: "bigint" })
  doctorCoordinationAmountMinor!: string;
  @Column({ name: "doctor_beneficiary_user_id", type: "uuid" })
  doctorBeneficiaryUserId!: string;
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "doctor_beneficiary_user_id" })
  doctorBeneficiaryUser!: User;
  @Column({ name: "hospital_coordination_bps", type: "smallint" })
  hospitalCoordinationBps!: number;
  @Column({ name: "hospital_coordination_amount_minor", type: "bigint" })
  hospitalCoordinationAmountMinor!: string;
  @Column({
    name: "hospital_beneficiary_provider_id",
    type: "uuid",
    nullable: true,
  })
  hospitalBeneficiaryProviderId!: string | null;
  @ManyToOne(() => Provider, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "hospital_beneficiary_provider_id" })
  hospitalBeneficiaryProvider!: Provider | null;
  @Column({
    name: "fulfillment_method",
    type: "enum",
    enum: PharmacyFulfillmentMethod,
    enumName: "pharmacy_fulfillment_method_enum",
  })
  fulfillmentMethod!: PharmacyFulfillmentMethod;
  @Column({ name: "delivery_address_snapshot", type: "jsonb", nullable: true })
  deliveryAddressSnapshot!: PharmacyDeliveryAddressSnapshot | null;
  @Column({ name: "gross_amount_minor", type: "bigint" })
  grossAmountMinor!: string;
  @Column({ type: "char", length: 3 }) currency!: string;
  @Column({ name: "commission_bps", type: "smallint" }) commissionBps!: number;
  @Column({
    name: "commission_source",
    type: "enum",
    enum: CommissionRateSource,
    enumName: "commission_rate_source_enum",
  })
  commissionSource!: CommissionRateSource;
  @Column({ name: "commission_amount_minor", type: "bigint" })
  commissionAmountMinor!: string;
  @Column({ name: "provider_share_minor", type: "bigint" })
  providerShareMinor!: string;
  @Column({
    type: "enum",
    enum: PharmacyFundingStatus,
    enumName: "pharmacy_funding_status_enum",
  })
  status!: PharmacyFundingStatus;
  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
  @OneToMany(
    () => PaymentAttempt,
    (attempt) => attempt.pharmacyFulfillmentFunding,
  )
  paymentAttempts!: PaymentAttempt[];
}
