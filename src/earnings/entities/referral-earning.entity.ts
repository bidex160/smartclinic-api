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
import { Patient } from "../../patients/entities/patient.entity";
import { PaymentTransaction } from "../../payments/entities/payment-transaction.entity";
import { Referral } from "../../rewards/entities/referral.entity";
import { ReferralCode } from "../../rewards/entities/referral-code.entity";
import { User } from "../../users/entities/user.entity";
import { ReferralEarningStatus } from "../enums/referral-earning-status.enum";

@Entity("referral_earnings")
@Index("UQ_referral_earnings_payment_transaction", ["paymentTransactionId"], {
  unique: true,
})
@Index("IDX_referral_earnings_referrer_status_currency", [
  "referrerUserId",
  "status",
  "currency",
])
@Check(
  "CHK_referral_earnings_money",
  '"gross_amount_minor" >= 0 AND "platform_amount_minor" >= 0 AND "referral_amount_minor" >= 0 AND "provider_amount_minor" >= 0 AND "platform_amount_minor" + "referral_amount_minor" + "provider_amount_minor" = "gross_amount_minor"',
)
export class ReferralEarning {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "referral_id", type: "uuid" }) referralId!: string;
  @ManyToOne(() => Referral, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "referral_id" })
  referral!: Referral;
  @Column({ name: "referral_code_id", type: "uuid" }) referralCodeId!: string;
  @ManyToOne(() => ReferralCode, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "referral_code_id" })
  referralCode!: ReferralCode;
  @Column({ name: "referral_code_snapshot", type: "varchar", length: 32 })
  referralCodeSnapshot!: string;
  @Column({ name: "referrer_user_id", type: "uuid" }) referrerUserId!: string;
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "referrer_user_id" })
  referrerUser!: User;
  @Column({ name: "patient_id", type: "uuid" }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "patient_id" })
  patient!: Patient;
  @Column({ name: "payment_transaction_id", type: "uuid" })
  paymentTransactionId!: string;
  @ManyToOne(() => PaymentTransaction, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "payment_transaction_id" })
  paymentTransaction!: PaymentTransaction;
  @Column({ name: "source_type", type: "varchar", length: 40 })
  sourceType!: string;
  @Column({ name: "source_reference", type: "varchar", length: 80 })
  sourceReference!: string;
  @Column({ name: "gross_amount_minor", type: "bigint" })
  grossAmountMinor!: string;
  @Column({ name: "platform_bps", type: "smallint" }) platformBps!: number;
  @Column({ name: "platform_amount_minor", type: "bigint" })
  platformAmountMinor!: string;
  @Column({ name: "referral_bps", type: "smallint" }) referralBps!: number;
  @Column({ name: "referral_amount_minor", type: "bigint" })
  referralAmountMinor!: string;
  @Column({ name: "provider_amount_minor", type: "bigint" })
  providerAmountMinor!: string;
  @Column({ type: "char", length: 3 }) currency!: string;
  @Column({ type: "varchar", length: 20 }) status!: ReferralEarningStatus;
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
