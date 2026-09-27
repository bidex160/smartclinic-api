import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { PaymentAttempt } from "../../payments/entities/payment-attempt.entity";
import { CareRequestFundingStatus } from "../enums/care-request-funding-status.enum";
import { CareRequest } from "./care-request.entity";
@Entity("care_request_funding")
@Index("UQ_care_request_funding_request", ["careRequestId"], { unique: true })
@Index("IDX_care_request_funding_status", ["status"])
@Check("CHK_care_request_funding_amount", '"amount_minor" >= 0')
@Check("CHK_care_request_funding_currency", "\"currency\" ~ '^[A-Z]{3}$'")
@Check(
  "CHK_care_request_funding_free",
  '("status" = \'SATISFIED_FREE\' AND "amount_minor" = 0) OR ("status" <> \'SATISFIED_FREE\' AND "amount_minor" > 0)',
)
export class CareRequestFunding {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "care_request_id", type: "uuid" }) careRequestId!: string;
  @OneToOne(() => CareRequest, (request) => request.funding, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "care_request_id" })
  careRequest!: CareRequest;
  @Column({ name: "amount_minor", type: "bigint" }) amountMinor!: string;
  @Column({ name: "base_amount_minor", type: "bigint" })
  baseAmountMinor!: string;
  @Column({ name: "programme_surcharge_minor", type: "bigint", default: "0" })
  programmeSurchargeMinor!: string;
  @Column({ name: "partner_family_id", type: "uuid", nullable: true })
  partnerFamilyId!: string | null;
  @Column({ name: "partner_program_id", type: "uuid", nullable: true })
  partnerProgramId!: string | null;
  @Column({ name: "programme_snapshot", type: "jsonb", nullable: true })
  programmeSnapshot!: Record<string, unknown> | null;
  @Column({
    name: "funding_route",
    type: "varchar",
    length: 20,
    default: "SELF_PAY",
  })
  fundingRoute!: "SELF_PAY" | "HMO";
  @Column({ name: "hmo_case_id", type: "uuid", nullable: true })
  hmoCaseId!: string | null;
  @Column({ name: "hmo_coverage_id", type: "uuid", nullable: true })
  hmoCoverageId!: string | null;
  @Column({ name: "hmo_authorization_id", type: "uuid", nullable: true })
  hmoAuthorizationId!: string | null;
  @Column({ name: "hmo_approved_amount_minor", type: "bigint", nullable: true })
  hmoApprovedAmountMinor!: string | null;
  @Column({ name: "hmo_snapshot", type: "jsonb", nullable: true })
  hmoSnapshot!: Record<string, unknown> | null;
  @Column({ type: "char", length: 3 }) currency!: string;
  @Column({
    type: "enum",
    enum: CareRequestFundingStatus,
    enumName: "care_request_funding_status_enum",
  })
  status!: CareRequestFundingStatus;
  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
  @OneToMany(() => PaymentAttempt, (attempt) => attempt.careRequestFunding)
  paymentAttempts!: PaymentAttempt[];
}
