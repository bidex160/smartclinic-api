import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { ClinicalRecordAccessRequestStatus } from '../enums/clinical-record-access-request-status.enum';
import { ClinicalRecordAccessScope } from '../enums/clinical-record-access-scope.enum';
import { ClinicalRecordType } from '../enums/clinical-record-type.enum';
import { ClinicalRecordAccessGrant } from './clinical-record-access-grant.entity';

@Entity('clinical_record_access_requests')
@Index('UQ_clinical_record_access_requests_reference', ['reference'], { unique: true })
@Index('IDX_clinical_record_access_requests_patient_created', ['patientId', 'createdAt'])
@Index('IDX_clinical_record_access_requests_provider_created', ['providerId', 'createdAt'])
@Index('IDX_clinical_record_access_requests_pending', ['patientId', 'providerId', 'status', 'expiresAt'])
@Check('CHK_clinical_record_access_requests_scope', `("scope" = 'ALL_RECORDS' AND "record_type" IS NULL AND "clinical_record_reference" IS NULL) OR ("scope" = 'RECORD_TYPE' AND "record_type" IS NOT NULL AND "clinical_record_reference" IS NULL) OR ("scope" = 'SINGLE_RECORD' AND "record_type" IS NULL AND "clinical_record_reference" IS NOT NULL)`)
export class ClinicalRecordAccessRequest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) reference!: string;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ type: 'enum', enum: ClinicalRecordAccessScope, enumName: 'clinical_record_access_scope_enum' }) scope!: ClinicalRecordAccessScope;
  @Column({ name: 'record_type', type: 'enum', enum: ClinicalRecordType, enumName: 'clinical_record_type_enum', nullable: true }) recordType!: ClinicalRecordType | null;
  @Column({ name: 'clinical_record_reference', type: 'varchar', length: 32, nullable: true }) clinicalRecordReference!: string | null;
  @Column({ type: 'varchar', length: 1000 }) reason!: string;
  @Column({ name: 'requested_expires_at', type: 'timestamptz', nullable: true }) requestedExpiresAt!: Date | null;
  @Column({ type: 'enum', enum: ClinicalRecordAccessRequestStatus, enumName: 'clinical_record_access_request_status_enum' }) status!: ClinicalRecordAccessRequestStatus;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true }) respondedAt!: Date | null;
  @Column({ name: 'approved_grant_id', type: 'uuid', nullable: true }) approvedGrantId!: string | null;
  @ManyToOne(() => ClinicalRecordAccessGrant, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'approved_grant_id' }) approvedGrant!: ClinicalRecordAccessGrant | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
