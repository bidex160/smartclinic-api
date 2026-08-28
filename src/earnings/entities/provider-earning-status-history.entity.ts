import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProviderEarningStatus } from '../enums/provider-earning-status.enum';
import { ProviderEarning } from './provider-earning.entity';

@Entity('provider_earning_status_history')
@Index('IDX_provider_earning_status_history_earning_created', ['providerEarningId', 'createdAt'])
export class ProviderEarningStatusHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_earning_id', type: 'uuid' }) providerEarningId!: string;
  @ManyToOne(() => ProviderEarning, earning => earning.history, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_earning_id' }) earning!: ProviderEarning;
  @Column({ name: 'from_status', type: 'enum', enum: ProviderEarningStatus, enumName: 'provider_earning_status_enum', nullable: true }) fromStatus!: ProviderEarningStatus | null;
  @Column({ name: 'to_status', type: 'enum', enum: ProviderEarningStatus, enumName: 'provider_earning_status_enum' }) toStatus!: ProviderEarningStatus;
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actor_user_id' }) actorUser!: User | null;
  @Column({ name: 'reason_code', type: 'varchar', length: 80 }) reasonCode!: string;
  @Column({ name: 'reason_note', type: 'text', nullable: true }) reasonNote!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
