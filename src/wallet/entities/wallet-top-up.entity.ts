import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum WalletTopUpStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

@Entity('wallet_top_ups')
@Index('UQ_wallet_top_ups_reference', ['reference'], { unique: true })
@Index('IDX_wallet_top_ups_user_status', ['userId', 'status'])
@Check('CHK_wallet_top_ups_amount_positive', '"amount_minor" > 0')
export class WalletTopUp {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 64 }) reference!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'amount_minor', type: 'bigint' }) amountMinor!: string;
  @Column({ type: 'char', length: 3, default: 'NGN' }) currency!: string;
  @Column({ type: 'enum', enum: WalletTopUpStatus, enumName: 'wallet_top_up_status_enum', default: WalletTopUpStatus.PENDING }) status!: WalletTopUpStatus;
  @Column({ name: 'connection_reference', type: 'varchar', length: 64, nullable: true }) connectionReference!: string | null;
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
