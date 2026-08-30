import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProviderPayoutStatus } from '../enums/provider-payout-status.enum';
import { ProviderPayout } from './provider-payout.entity';

@Entity('provider_payout_status_history')
@Index('IDX_provider_payout_status_history_payout_created', ['payoutId', 'createdAt'])
export class ProviderPayoutStatusHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'payout_id', type: 'uuid' }) payoutId!: string;
  @ManyToOne(() => ProviderPayout, payout => payout.history, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'payout_id' }) payout!: ProviderPayout;
  @Column({ name: 'from_status', type: 'enum', enum: ProviderPayoutStatus, enumName: 'provider_payout_status_enum', nullable: true }) fromStatus!: ProviderPayoutStatus | null;
  @Column({ name: 'to_status', type: 'enum', enum: ProviderPayoutStatus, enumName: 'provider_payout_status_enum' }) toStatus!: ProviderPayoutStatus;
  @Column({ name: 'actor_user_id', type: 'uuid' }) actorUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actor_user_id' }) actorUser!: User;
  @Column({ name: 'reason_code', type: 'varchar', length: 80 }) reasonCode!: string;
  @Column({ name: 'reason_note', type: 'varchar', length: 1000, nullable: true }) reasonNote!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
