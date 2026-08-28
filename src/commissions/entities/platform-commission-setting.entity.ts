import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('platform_commission_settings')
@Check('CHK_platform_commission_settings_singleton', '"id" = 1')
@Check('CHK_platform_commission_settings_rate', '"default_provider_commission_bps" IS NULL OR ("default_provider_commission_bps" >= 0 AND "default_provider_commission_bps" <= 10000)')
export class PlatformCommissionSetting {
  @PrimaryColumn({ type: 'smallint', default: 1 }) id!: number;
  @Column({ name: 'default_provider_commission_bps', type: 'smallint', nullable: true }) defaultProviderCommissionBps!: number | null;
  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true }) updatedByUserId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'updated_by_user_id' }) updatedByUser!: User | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
