import { BeforeInsert, Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PaymentTransaction } from '../../payments/entities/payment-transaction.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { CommissionRateSource } from '../../commissions/enums/commission-rate-source.enum';
import { ProviderEarningSourceType } from '../enums/provider-earning-source-type.enum';
import { ProviderEarningStatus } from '../enums/provider-earning-status.enum';
import { generateProviderEarningReference } from '../provider-earning-reference';
import { ProviderEarningStatusHistory } from './provider-earning-status-history.entity';

@Entity('provider_earnings')
@Index('UQ_provider_earnings_reference', ['reference'], { unique: true })
@Index('UQ_provider_earnings_source', ['sourceType', 'sourceReference'], { unique: true })
@Index('UQ_provider_earnings_payment_transaction', ['paymentTransactionId'], { unique: true, where: '"payment_transaction_id" IS NOT NULL' })
@Index('IDX_provider_earnings_provider_status_currency', ['providerId', 'status', 'currency'])
@Index('IDX_provider_earnings_created', ['createdAt'])
@Check('CHK_provider_earnings_money', '"gross_amount_minor" >= 0 AND "commission_amount_minor" >= 0 AND "provider_share_minor" >= 0 AND "commission_amount_minor" + "provider_share_minor" = "gross_amount_minor"')
@Check('CHK_provider_earnings_commission_bps', '"commission_bps" >= 0 AND "commission_bps" <= 10000')
@Check('CHK_provider_earnings_currency', '"currency" ~ \'^[A-Z]{3}$\'')
export class ProviderEarning {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) reference!: string;
  @BeforeInsert() generateReference(): void { if (!this.reference) this.reference = generateProviderEarningReference(); }
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'payment_transaction_id', type: 'uuid', nullable: true }) paymentTransactionId!: string | null;
  @ManyToOne(() => PaymentTransaction, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'payment_transaction_id' }) paymentTransaction!: PaymentTransaction | null;
  @Column({ name: 'source_type', type: 'enum', enum: ProviderEarningSourceType, enumName: 'provider_earning_source_type_enum' }) sourceType!: ProviderEarningSourceType;
  @Column({ name: 'source_reference', type: 'varchar', length: 80 }) sourceReference!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ name: 'gross_amount_minor', type: 'bigint' }) grossAmountMinor!: string;
  @Column({ name: 'commission_bps', type: 'smallint' }) commissionBps!: number;
  @Column({ name: 'commission_source', type: 'enum', enum: CommissionRateSource, enumName: 'provider_earning_commission_source_enum' }) commissionSource!: CommissionRateSource;
  @Column({ name: 'commission_amount_minor', type: 'bigint' }) commissionAmountMinor!: string;
  @Column({ name: 'provider_share_minor', type: 'bigint' }) providerShareMinor!: string;
  @Column({ type: 'enum', enum: ProviderEarningStatus, enumName: 'provider_earning_status_enum' }) status!: ProviderEarningStatus;
  @Column({ name: 'payable_at', type: 'timestamptz', nullable: true }) payableAt!: Date | null;
  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true }) settledAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => ProviderEarningStatusHistory, history => history.earning) history!: ProviderEarningStatusHistory[];
}
