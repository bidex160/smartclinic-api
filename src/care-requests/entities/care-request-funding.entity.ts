import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PaymentAttempt } from '../../payments/entities/payment-attempt.entity';
import { CareRequestFundingStatus } from '../enums/care-request-funding-status.enum';
import { CareRequest } from './care-request.entity';
@Entity('care_request_funding')
@Index('UQ_care_request_funding_request', ['careRequestId'], { unique: true })
@Index('IDX_care_request_funding_status', ['status'])
@Check('CHK_care_request_funding_amount', '"amount_minor" >= 0')
@Check('CHK_care_request_funding_currency', '"currency" ~ \'^[A-Z]{3}$\'')
@Check('CHK_care_request_funding_free', '("status" = \'SATISFIED_FREE\' AND "amount_minor" = 0) OR ("status" <> \'SATISFIED_FREE\' AND "amount_minor" > 0)')
export class CareRequestFunding {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'care_request_id', type: 'uuid' }) careRequestId!: string;
  @OneToOne(() => CareRequest, (request) => request.funding, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'care_request_id' }) careRequest!: CareRequest;
  @Column({ name: 'amount_minor', type: 'bigint' }) amountMinor!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ type: 'enum', enum: CareRequestFundingStatus, enumName: 'care_request_funding_status_enum' }) status!: CareRequestFundingStatus;
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => PaymentAttempt, attempt => attempt.careRequestFunding) paymentAttempts!: PaymentAttempt[];
}
