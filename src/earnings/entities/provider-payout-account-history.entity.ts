import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProviderPayoutAccountStatus } from '../enums/provider-payout-account.enum';
import { ProviderPayoutAccount } from './provider-payout-account.entity';
@Entity('provider_payout_account_history') @Index('IDX_provider_payout_account_history_account_created', ['accountId', 'createdAt'])
export class ProviderPayoutAccountHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'account_id', type: 'uuid' }) accountId!: string;
  @ManyToOne(() => ProviderPayoutAccount, account => account.history, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'account_id' }) account!: ProviderPayoutAccount;
  @Column({ name: 'event_type', type: 'varchar', length: 80 }) eventType!: string;
  @Column({ name: 'from_status', type: 'enum', enum: ProviderPayoutAccountStatus, enumName: 'provider_payout_account_status_enum', nullable: true }) fromStatus!: ProviderPayoutAccountStatus | null;
  @Column({ name: 'to_status', type: 'enum', enum: ProviderPayoutAccountStatus, enumName: 'provider_payout_account_status_enum' }) toStatus!: ProviderPayoutAccountStatus;
  @Column({ name: 'actor_user_id', type: 'uuid' }) actorUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actor_user_id' }) actorUser!: User;
  @Column({ name: 'reason_note', type: 'varchar', length: 1000, nullable: true }) reasonNote!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
