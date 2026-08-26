import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "../../users/entities/user.entity";
import { RewardWithdrawalStatus } from "../enums/reward-withdrawal-status.enum";
import { RewardWithdrawalRequest } from "./reward-withdrawal-request.entity";

@Entity("reward_withdrawal_status_history")
export class RewardWithdrawalStatusHistory {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "withdrawal_id", type: "uuid" }) withdrawalId!: string;
  @ManyToOne(() => RewardWithdrawalRequest, (withdrawal) => withdrawal.histories, { onDelete: "RESTRICT" }) @JoinColumn({ name: "withdrawal_id" }) withdrawal!: RewardWithdrawalRequest;
  @Column({ name: "from_status", type: "enum", enum: RewardWithdrawalStatus, enumName: "reward_withdrawal_status_enum", nullable: true }) fromStatus!: RewardWithdrawalStatus | null;
  @Column({ name: "to_status", type: "enum", enum: RewardWithdrawalStatus, enumName: "reward_withdrawal_status_enum" }) toStatus!: RewardWithdrawalStatus;
  @Column({ name: "actor_user_id", type: "uuid" }) actorUserId!: string;
  @ManyToOne(() => User, { onDelete: "RESTRICT" }) @JoinColumn({ name: "actor_user_id" }) actorUser!: User;
  @Column({ name: "reason_code", type: "varchar", length: 80 }) reasonCode!: string;
  @Column({ name: "reason_note", type: "varchar", length: 1000, nullable: true }) reasonNote!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
