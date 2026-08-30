import { BeforeInsert, Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Provider } from '../../providers/entities/provider.entity';
import { User } from '../../users/entities/user.entity';
import { ProviderPayoutSettlementMethod } from '../enums/provider-payout-settlement-method.enum';
import { ProviderPayoutStatus } from '../enums/provider-payout-status.enum';
import { generateProviderPayoutReference } from '../provider-payout-reference';
import { ProviderPayoutEarning } from './provider-payout-earning.entity';
import { ProviderPayoutStatusHistory } from './provider-payout-status-history.entity';
import { ProviderPayoutAccount } from './provider-payout-account.entity';

export interface ProviderPayoutDestinationSnapshot {
  payoutAccountReference: string; type: string; countryCode: string; currency: string;
  bankCode: string; bankName: string; maskedAccountNumber: string; accountName: string;
}

@Entity('provider_payouts')
@Index('UQ_provider_payouts_reference', ['reference'], { unique: true })
@Index('UQ_provider_payouts_external_reference', ['externalReference'], { unique: true, where: '"external_reference" IS NOT NULL' })
@Index('IDX_provider_payouts_provider_status_created', ['providerId', 'status', 'createdAt'])
@Index('IDX_provider_payouts_status_currency_created', ['status', 'currency', 'createdAt'])
@Check('CHK_provider_payouts_amount_count', '"total_amount_minor" >= 0 AND "earning_count" > 0')
@Check('CHK_provider_payouts_currency', '"currency" ~ \'^[A-Z]{3}$\'')
@Check('CHK_provider_payouts_destination_snapshot', '"destination_snapshot" IS NULL OR jsonb_typeof("destination_snapshot") = \'object\'')
export class ProviderPayout {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 40 }) reference!: string;
  @BeforeInsert() generateReference(): void { if (!this.reference) this.reference = generateProviderPayoutReference(); }
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ name: 'total_amount_minor', type: 'bigint' }) totalAmountMinor!: string;
  @Column({ name: 'earning_count', type: 'integer' }) earningCount!: number;
  @Column({ type: 'enum', enum: ProviderPayoutStatus, enumName: 'provider_payout_status_enum' }) status!: ProviderPayoutStatus;
  @Column({ name: 'settlement_method', type: 'enum', enum: ProviderPayoutSettlementMethod, enumName: 'provider_payout_settlement_method_enum' }) settlementMethod!: ProviderPayoutSettlementMethod;
  @Column({ name: 'provider_payout_account_id', type: 'uuid', nullable: true }) providerPayoutAccountId!: string | null;
  @ManyToOne(() => ProviderPayoutAccount, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_payout_account_id' }) providerPayoutAccount!: ProviderPayoutAccount | null;
  @Column({ name: 'destination_snapshot', type: 'jsonb', nullable: true }) destinationSnapshot!: ProviderPayoutDestinationSnapshot | null;
  @Column({ name: 'external_reference', type: 'varchar', length: 160, nullable: true }) externalReference!: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) note!: string | null;
  @Column({ name: 'initiated_by_user_id', type: 'uuid' }) initiatedByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'initiated_by_user_id' }) initiatedByUser!: User;
  @Column({ name: 'processing_at', type: 'timestamptz', nullable: true }) processingAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true }) failedAt!: Date | null;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true }) cancelledAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => ProviderPayoutEarning, membership => membership.payout) earnings!: ProviderPayoutEarning[];
  @OneToMany(() => ProviderPayoutStatusHistory, history => history.payout) history!: ProviderPayoutStatusHistory[];
}
