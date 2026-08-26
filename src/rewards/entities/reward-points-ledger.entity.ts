import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RewardLedgerDirection } from '../enums/reward-ledger-direction.enum';
import { Referral } from './referral.entity';

@Entity('reward_points_ledger')
@Check('CHK_reward_points_ledger_positive_points', 'points > 0')
@Index('UQ_reward_points_ledger_event_key', ['eventKey'], { unique: true })
@Index('IDX_reward_points_ledger_user_created', ['userId', 'createdAt'])
export class RewardPointsLedger {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'referral_id', type: 'uuid', nullable: true }) referralId!: string | null;
  @ManyToOne(() => Referral, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'referral_id' }) referral!: Referral | null;
  @Column({ name: 'event_key', type: 'varchar', length: 160 }) eventKey!: string;
  @Column({ name: 'event_type', type: 'varchar', length: 80 }) eventType!: string;
  @Column({ type: 'enum', enum: RewardLedgerDirection, enumName: 'reward_ledger_direction_enum' }) direction!: RewardLedgerDirection;
  @Column({ type: 'integer' }) points!: number;
  @Column({ name: 'reason_code', type: 'varchar', length: 80 }) reasonCode!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
