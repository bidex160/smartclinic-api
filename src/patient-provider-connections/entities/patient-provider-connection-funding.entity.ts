import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PaymentAttempt } from '../../payments/entities/payment-attempt.entity';
import { PatientProviderConnectionFundingPurpose, PatientProviderConnectionFundingStatus } from '../enums/patient-provider-connection-funding.enum';
import { PatientProviderConnection } from './patient-provider-connection.entity';
@Entity('patient_provider_connection_funding')
@Index('UQ_patient_provider_connection_funding_purpose', ['connectionId', 'purpose'], { unique: true })
@Check('CHK_patient_provider_connection_funding_amount', '"amount_minor" >= 0')
@Check('CHK_patient_provider_connection_funding_currency', `"currency" ~ '^[A-Z]{3}$'`)
@Check('CHK_patient_provider_connection_funding_free', `("status" = 'SATISFIED_FREE' AND "amount_minor" = 0) OR ("status" <> 'SATISFIED_FREE' AND "amount_minor" > 0)`)
export class PatientProviderConnectionFunding {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({ name: 'connection_id', type: 'uuid' }) connectionId!: string;
 @ManyToOne(() => PatientProviderConnection, connection => connection.fundings, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'connection_id' }) connection!: PatientProviderConnection;
 @Column({ type: 'enum', enum: PatientProviderConnectionFundingPurpose, enumName: 'patient_provider_connection_funding_purpose_enum' }) purpose!: PatientProviderConnectionFundingPurpose;
 @Column({ name: 'amount_minor', type: 'bigint' }) amountMinor!: string;
 @Column({ type: 'char', length: 3 }) currency!: string;
 @Column({ type: 'enum', enum: PatientProviderConnectionFundingStatus, enumName: 'patient_provider_connection_funding_status_enum' }) status!: PatientProviderConnectionFundingStatus;
 @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt!: Date | null;
 @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
 @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
 @OneToMany(() => PaymentAttempt, attempt => attempt.patientProviderConnectionFunding) paymentAttempts!: PaymentAttempt[];
}
