import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { User } from '../../users/entities/user.entity';
import { PatientProviderConnectionStatus } from '../enums/patient-provider-connection-status.enum';
import { PatientProviderConnectionType } from '../enums/patient-provider-connection-type.enum';
import { PatientProviderConnectionFunding } from './patient-provider-connection-funding.entity';
import { PatientProviderConnectionHistory } from './patient-provider-connection-history.entity';

@Entity('patient_provider_connections')
@Index('UQ_patient_provider_connections_reference', ['reference'], { unique: true })
@Index('IDX_patient_provider_connections_patient_created', ['patientId', 'createdAt'])
@Index('IDX_patient_provider_connections_provider_status', ['providerId', 'status'])
@Index('UQ_patient_provider_connections_active_pair', ['patientId', 'providerId'], { unique: true, where: `"status" IN ('AWAITING_FUNDING','SUBMITTED','UNABLE_TO_VERIFY','CONNECTED')` })
@Check('CHK_patient_provider_connections_fee', '"commercial_amount_minor" >= 0')
@Check('CHK_patient_provider_connections_currency', `"commercial_currency" ~ '^[A-Z]{3}$'`)
@Check('CHK_patient_provider_connections_external_reference', `"status" <> 'CONNECTED' OR "external_patient_reference" IS NOT NULL`)
export class PatientProviderConnection {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 19 }) reference!: string;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'initiated_by_user_id', type: 'uuid' }) initiatedByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'initiated_by_user_id' }) initiatedBy!: User;
  @Column({ name: 'original_intent', type: 'enum', enum: PatientProviderConnectionType, enumName: 'patient_provider_connection_type_enum' }) originalIntent!: PatientProviderConnectionType;
  @Column({ name: 'current_path', type: 'enum', enum: PatientProviderConnectionType, enumName: 'patient_provider_connection_type_enum' }) currentPath!: PatientProviderConnectionType;
  @Column({ type: 'enum', enum: PatientProviderConnectionStatus, enumName: 'patient_provider_connection_status_enum' }) status!: PatientProviderConnectionStatus;
  @Column({ name: 'claimed_external_patient_reference', type: 'varchar', length: 160, nullable: true }) claimedExternalPatientReference!: string | null;
  @Column({ name: 'external_patient_reference', type: 'varchar', length: 160, nullable: true }) externalPatientReference!: string | null;
  @Column({ name: 'demographic_snapshot', type: 'jsonb' }) demographicSnapshot!: Record<string, string | null>;
  @Column({ name: 'consent_captured_at', type: 'timestamptz' }) consentCapturedAt!: Date;
  @Column({ name: 'commercial_amount_minor', type: 'bigint' }) commercialAmountMinor!: string;
  @Column({ name: 'commercial_currency', type: 'char', length: 3 }) commercialCurrency!: string;
  @Column({ name: 'verification_failed_at', type: 'timestamptz', nullable: true }) verificationFailedAt!: Date | null;
  @Column({ name: 'conversion_requested_at', type: 'timestamptz', nullable: true }) conversionRequestedAt!: Date | null;
  @Column({ name: 'connected_at', type: 'timestamptz', nullable: true }) connectedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => PatientProviderConnectionFunding, funding => funding.connection) fundings!: PatientProviderConnectionFunding[];
  @OneToMany(() => PatientProviderConnectionHistory, history => history.connection) history!: PatientProviderConnectionHistory[];
}
