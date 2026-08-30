import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProviderEarning } from './provider-earning.entity';
import { ProviderPayout } from './provider-payout.entity';

@Entity('provider_payout_earnings')
@Index('UQ_provider_payout_earning_membership', ['payoutId', 'providerEarningId'], { unique: true })
@Index('UQ_provider_payout_earning_active_reservation', ['providerEarningId'], { unique: true, where: '"released_at" IS NULL' })
@Index('IDX_provider_payout_earnings_payout', ['payoutId'])
@Check('CHK_provider_payout_earning_amount', '"provider_share_minor" >= 0')
export class ProviderPayoutEarning {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'payout_id', type: 'uuid' }) payoutId!: string;
  @ManyToOne(() => ProviderPayout, payout => payout.earnings, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'payout_id' }) payout!: ProviderPayout;
  @Column({ name: 'provider_earning_id', type: 'uuid' }) providerEarningId!: string;
  @ManyToOne(() => ProviderEarning, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_earning_id' }) earning!: ProviderEarning;
  @Column({ name: 'provider_share_minor', type: 'bigint' }) providerShareMinor!: string;
  @Column({ name: 'released_at', type: 'timestamptz', nullable: true }) releasedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
