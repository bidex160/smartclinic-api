import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Provider } from '../../providers/entities/provider.entity';
import { User } from '../../users/entities/user.entity';
import { CommissionConfigTarget } from '../enums/commission-config-target.enum';

@Entity('commission_config_history')
@Check('CHK_commission_config_history_rates', '("old_rate_bps" IS NULL OR ("old_rate_bps" >= 0 AND "old_rate_bps" <= 10000)) AND ("new_rate_bps" IS NULL OR ("new_rate_bps" >= 0 AND "new_rate_bps" <= 10000))')
@Check('CHK_commission_config_history_target_provider', '("target" = \'PLATFORM_DEFAULT\' AND "provider_id" IS NULL) OR ("target" = \'PROVIDER_OVERRIDE\' AND "provider_id" IS NOT NULL)')
@Index('IDX_commission_config_history_target_created', ['target', 'createdAt'])
@Index('IDX_commission_config_history_provider_created', ['providerId', 'createdAt'])
export class CommissionConfigHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'enum', enum: CommissionConfigTarget, enumName: 'commission_config_target_enum' }) target!: CommissionConfigTarget;
  @Column({ name: 'provider_id', type: 'uuid', nullable: true }) providerId!: string | null;
  @ManyToOne(() => Provider, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider | null;
  @Column({ name: 'old_rate_bps', type: 'smallint', nullable: true }) oldRateBps!: number | null;
  @Column({ name: 'new_rate_bps', type: 'smallint', nullable: true }) newRateBps!: number | null;
  @Column({ name: 'actor_user_id', type: 'uuid' }) actorUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actor_user_id' }) actorUser!: User;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
