import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Booking } from "../../bookings/entities/booking.entity";
import { User } from "../../users/entities/user.entity";
import { RewardBookingRedemptionStatus } from "../enums/reward-booking-redemption-status.enum";

@Entity("reward_booking_redemptions")
@Check("CHK_reward_booking_redemption_positive", '"points_reserved" > 0 AND "rate_points" > 0 AND "rate_amount_minor" > 0 AND "amount_minor" > 0')
@Index("UQ_reward_booking_redemption_active_booking", ["bookingId"], { unique: true, where: '"status" = \'RESERVED\'' })
@Index("IDX_reward_booking_redemption_user_status", ["userId", "status"])
export class RewardBookingRedemption {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "booking_id", type: "uuid" }) bookingId!: string;
  @ManyToOne(() => Booking, { onDelete: "RESTRICT" }) @JoinColumn({ name: "booking_id" }) booking!: Booking;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @ManyToOne(() => User, { onDelete: "RESTRICT" }) @JoinColumn({ name: "user_id" }) user!: User;
  @Column({ name: "points_reserved", type: "integer" }) pointsReserved!: number;
  @Column({ name: "rate_points", type: "integer" }) ratePoints!: number;
  @Column({ name: "rate_amount_minor", type: "bigint" }) rateAmountMinor!: string;
  @Column({ name: "amount_minor", type: "bigint" }) amountMinor!: string;
  @Column({ type: "varchar", length: 3 }) currency!: string;
  @Column({ type: "enum", enum: RewardBookingRedemptionStatus, enumName: "reward_booking_redemption_status_enum" }) status!: RewardBookingRedemptionStatus;
  @Column({ name: "settled_at", type: "timestamptz", nullable: true }) settledAt!: Date | null;
  @Column({ name: "released_at", type: "timestamptz", nullable: true }) releasedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
