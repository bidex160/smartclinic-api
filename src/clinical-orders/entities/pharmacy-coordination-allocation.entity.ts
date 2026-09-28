import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { PaymentTransaction } from "../../payments/entities/payment-transaction.entity";
import { Provider } from "../../providers/entities/provider.entity";
import { User } from "../../users/entities/user.entity";
import { PatientWalletEntry } from "../../wallet/entities/patient-wallet-entry.entity";
import {
  PharmacyCoordinationAllocationStatus,
  PharmacyCoordinationAllocationType,
} from "../enums/pharmacy-coordination-allocation.enum";
import { PharmacyFulfillmentFunding } from "./pharmacy-fulfillment-funding.entity";

@Entity("pharmacy_coordination_allocations")
@Index("UQ_pharmacy_coordination_allocation_type", ["fundingId", "type"], {
  unique: true,
})
@Index("IDX_pharmacy_coordination_user_status", ["beneficiaryUserId", "status"])
@Index("IDX_pharmacy_coordination_provider_status", [
  "beneficiaryProviderId",
  "status",
])
@Check(
  "CHK_pharmacy_coordination_beneficiary",
  `("type" = 'DOCTOR' AND "beneficiary_user_id" IS NOT NULL AND "beneficiary_provider_id" IS NULL) OR ("type" = 'HOSPITAL' AND "beneficiary_provider_id" IS NOT NULL AND "beneficiary_user_id" IS NULL)`,
)
@Check(
  "CHK_pharmacy_coordination_amount",
  '"basis_amount_minor" >= 0 AND "bps_snapshot" BETWEEN 0 AND 10000 AND "amount_minor" > 0',
)
@Check(
  "CHK_pharmacy_coordination_settlement_source",
  '(CASE WHEN "payment_transaction_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "wallet_entry_id" IS NULL THEN 0 ELSE 1 END) = 1',
)
export class PharmacyCoordinationAllocation {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "funding_id", type: "uuid" }) fundingId!: string;
  @ManyToOne(() => PharmacyFulfillmentFunding, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "funding_id" })
  funding!: PharmacyFulfillmentFunding;
  @Column({ name: "payment_transaction_id", type: "uuid", nullable: true })
  paymentTransactionId!: string | null;
  @ManyToOne(() => PaymentTransaction, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "payment_transaction_id" })
  paymentTransaction!: PaymentTransaction | null;
  @Column({ name: "wallet_entry_id", type: "uuid", nullable: true })
  walletEntryId!: string | null;
  @ManyToOne(() => PatientWalletEntry, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "wallet_entry_id" })
  walletEntry!: PatientWalletEntry | null;
  @Column({
    type: "enum",
    enum: PharmacyCoordinationAllocationType,
    enumName: "pharmacy_coordination_allocation_type_enum",
  })
  type!: PharmacyCoordinationAllocationType;
  @Column({ name: "beneficiary_user_id", type: "uuid", nullable: true })
  beneficiaryUserId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "beneficiary_user_id" })
  beneficiaryUser!: User | null;
  @Column({ name: "beneficiary_provider_id", type: "uuid", nullable: true })
  beneficiaryProviderId!: string | null;
  @ManyToOne(() => Provider, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "beneficiary_provider_id" })
  beneficiaryProvider!: Provider | null;
  @Column({ name: "source_order_reference", type: "varchar", length: 32 })
  sourceOrderReference!: string;
  @Column({ name: "source_fulfillment_reference", type: "varchar", length: 32 })
  sourceFulfillmentReference!: string;
  @Column({ name: "basis_amount_minor", type: "bigint" })
  basisAmountMinor!: string;
  @Column({ name: "bps_snapshot", type: "smallint" }) bpsSnapshot!: number;
  @Column({ name: "amount_minor", type: "bigint" }) amountMinor!: string;
  @Column({ type: "char", length: 3 }) currency!: string;
  @Column({
    type: "enum",
    enum: PharmacyCoordinationAllocationStatus,
    enumName: "pharmacy_coordination_allocation_status_enum",
  })
  status!: PharmacyCoordinationAllocationStatus;
  @Column({ name: "payable_at", type: "timestamptz", nullable: true })
  payableAt!: Date | null;
  @Column({ name: "settled_at", type: "timestamptz", nullable: true })
  settledAt!: Date | null;
  @Column({ name: "reversed_at", type: "timestamptz", nullable: true })
  reversedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
