import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "../../users/entities/user.entity";
import { RewardWithdrawalStatus } from "../enums/reward-withdrawal-status.enum";
import { RewardWithdrawalStatusHistory } from "./reward-withdrawal-status-history.entity";

@Entity("reward_withdrawal_requests")
@Check("CHK_reward_withdrawal_positive", '"points_requested" > 0 AND "rate_points" > 0 AND "rate_amount_minor" > 0 AND "amount_minor" > 0')
@Index("UQ_reward_withdrawal_public_reference", ["publicReference"], { unique: true })
@Index("IDX_reward_withdrawal_user_status", ["userId", "status"])
@Index("IDX_reward_withdrawal_status_requested", ["status", "requestedAt"])
export class RewardWithdrawalRequest {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "public_reference", type: "varchar", length: 32 }) publicReference!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @ManyToOne(() => User, { onDelete: "RESTRICT" }) @JoinColumn({ name: "user_id" }) user!: User;
  @Column({ name: "points_requested", type: "integer" }) pointsRequested!: number;
  @Column({ name: "rate_points", type: "integer" }) ratePoints!: number;
  @Column({ name: "rate_amount_minor", type: "bigint" }) rateAmountMinor!: string;
  @Column({ name: "amount_minor", type: "bigint" }) amountMinor!: string;
  @Column({ type: "varchar", length: 3 }) currency!: string;
  @Column({ name: "bank_name", type: "varchar", length: 120 }) bankName!: string;
  @Column({ name: "bank_code", type: "varchar", length: 20, nullable: true }) bankCode!: string | null;
  @Column({ name: "account_number", type: "varchar", length: 20 }) accountNumber!: string;
  @Column({ name: "account_name", type: "varchar", length: 160 }) accountName!: string;
  @Column({ type: "enum", enum: RewardWithdrawalStatus, enumName: "reward_withdrawal_status_enum" }) status!: RewardWithdrawalStatus;
  @Column({ name: "requested_at", type: "timestamptz" }) requestedAt!: Date;
  @Column({ name: "processing_at", type: "timestamptz", nullable: true }) processingAt!: Date | null;
  @Column({ name: "paid_at", type: "timestamptz", nullable: true }) paidAt!: Date | null;
  @Column({ name: "failed_at", type: "timestamptz", nullable: true }) failedAt!: Date | null;
  @Column({ name: "cancelled_at", type: "timestamptz", nullable: true }) cancelledAt!: Date | null;
  @Column({ name: "processed_by_user_id", type: "uuid", nullable: true }) processedByUserId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: "RESTRICT" }) @JoinColumn({ name: "processed_by_user_id" }) processedByUser!: User | null;
  @Column({ name: "admin_note", type: "varchar", length: 1000, nullable: true }) adminNote!: string | null;
  @Column({ name: "external_reference", type: "varchar", length: 160, nullable: true }) externalReference!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
  @OneToMany(() => RewardWithdrawalStatusHistory, (history) => history.withdrawal) histories!: RewardWithdrawalStatusHistory[];
}
