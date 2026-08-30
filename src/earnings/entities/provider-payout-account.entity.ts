import { BeforeInsert, Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Provider } from '../../providers/entities/provider.entity';
import { ProviderPayoutAccountStatus, ProviderPayoutAccountType } from '../enums/provider-payout-account.enum';
import { generateProviderPayoutAccountReference } from '../provider-payout-account-reference';
import { ProviderPayoutAccountHistory } from './provider-payout-account-history.entity';

@Entity('provider_payout_accounts')
@Index('UQ_provider_payout_accounts_reference', ['reference'], { unique: true })
@Index('UQ_provider_payout_accounts_active_identity', ['providerId', 'countryCode', 'currency', 'bankCode', 'accountFingerprint'], { unique: true, where: '"status" <> \'DISABLED\'' })
@Index('UQ_provider_payout_accounts_default_currency', ['providerId', 'currency'], { unique: true, where: '"is_default" = true' })
@Index('IDX_provider_payout_accounts_provider_status_created', ['providerId', 'status', 'createdAt'])
@Check('CHK_provider_payout_accounts_country', '"country_code" ~ \'^[A-Z]{2}$\'')
@Check('CHK_provider_payout_accounts_currency', '"currency" ~ \'^[A-Z]{3}$\'')
@Check('CHK_provider_payout_accounts_default_verified', 'NOT "is_default" OR "status" = \'VERIFIED\'')
export class ProviderPayoutAccount {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 40 }) reference!: string;
  @BeforeInsert() generateReference(): void { if (!this.reference) this.reference = generateProviderPayoutAccountReference(); }
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ type: 'enum', enum: ProviderPayoutAccountType, enumName: 'provider_payout_account_type_enum' }) type!: ProviderPayoutAccountType;
  @Column({ name: 'country_code', type: 'char', length: 2 }) countryCode!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ name: 'bank_code', type: 'varchar', length: 20 }) bankCode!: string;
  @Column({ name: 'bank_name', type: 'varchar', length: 120 }) bankName!: string;
  @Column({ name: 'account_number_encrypted', type: 'text' }) encryptedAccountNumber!: string;
  @Column({ name: 'account_number_iv', type: 'varchar', length: 32 }) encryptionIv!: string;
  @Column({ name: 'account_number_auth_tag', type: 'varchar', length: 32 }) encryptionAuthTag!: string;
  @Column({ name: 'account_number_fingerprint', type: 'char', length: 64 }) accountFingerprint!: string;
  @Column({ name: 'account_number_last4', type: 'char', length: 4 }) accountNumberLast4!: string;
  @Column({ name: 'account_name', type: 'varchar', length: 160 }) accountName!: string;
  @Column({ type: 'enum', enum: ProviderPayoutAccountStatus, enumName: 'provider_payout_account_status_enum' }) status!: ProviderPayoutAccountStatus;
  @Column({ name: 'is_default', type: 'boolean', default: false }) isDefault!: boolean;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt!: Date | null;
  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true }) disabledAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => ProviderPayoutAccountHistory, history => history.account) history!: ProviderPayoutAccountHistory[];
}
