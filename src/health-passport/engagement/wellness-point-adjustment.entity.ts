import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { User } from '../../users/entities/user.entity';

/** A manual change to a patient's wellness points by SmartClinic staff, always with a reason. */
@Entity('wellness_point_adjustments')
@Check('CHK_wellness_point_adjustment_nonzero', '"points" <> 0')
@Index('IDX_wellness_point_adjustment_user_created', ['userId', 'createdAt'])
export class WellnessPointAdjustment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User;
  /** Positive adds points, negative removes them. */
  @Column({ type: 'integer' }) points!: number;
  @Column({ type: 'varchar', length: 300 }) reason!: string;
  @Column({ name: 'admin_user_id', type: 'uuid' }) adminUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'admin_user_id' }) admin!: User;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
