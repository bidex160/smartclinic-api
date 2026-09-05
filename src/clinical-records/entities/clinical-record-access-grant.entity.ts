import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity'; import { Provider } from '../../providers/entities/provider.entity'; import { User } from '../../users/entities/user.entity';
import { ClinicalRecordAccessScope } from '../enums/clinical-record-access-scope.enum'; import { ClinicalRecordType } from '../enums/clinical-record-type.enum'; import { ClinicalRecord } from './clinical-record.entity';
@Entity('clinical_record_access_grants')
@Index('UQ_clinical_record_access_grants_reference', ['reference'], { unique: true })
@Index('IDX_clinical_record_access_grants_patient', ['patientId', 'createdAt'])
@Index('IDX_clinical_record_access_grants_provider_active', ['granteeProviderId', 'revokedAt', 'expiresAt'])
@Check('CHK_clinical_record_access_grants_scope', `("scope" IN ('HEALTH_PASSPORT','ALL_RECORDS') AND "record_type" IS NULL AND "clinical_record_id" IS NULL) OR ("scope" = 'RECORD_TYPE' AND "record_type" IS NOT NULL AND "clinical_record_id" IS NULL) OR ("scope" = 'SINGLE_RECORD' AND "record_type" IS NULL AND "clinical_record_id" IS NOT NULL)`)
@Check('CHK_clinical_record_access_grants_expiry', '"expires_at" IS NULL OR "expires_at" > "granted_at"')
export class ClinicalRecordAccessGrant {
 @PrimaryGeneratedColumn('uuid') id!: string; @Column({ type: 'varchar', length: 32 }) reference!: string;
 @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string; @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
 @Column({ name: 'grantee_provider_id', type: 'uuid' }) granteeProviderId!: string; @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'grantee_provider_id' }) granteeProvider!: Provider;
 @Column({ type: 'enum', enum: ClinicalRecordAccessScope, enumName: 'clinical_record_access_scope_enum' }) scope!: ClinicalRecordAccessScope;
 @Column({ name: 'record_type', type: 'enum', enum: ClinicalRecordType, enumName: 'clinical_record_type_enum', nullable: true }) recordType!: ClinicalRecordType | null;
 @Column({ name: 'clinical_record_id', type: 'uuid', nullable: true }) clinicalRecordId!: string | null; @ManyToOne(() => ClinicalRecord, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'clinical_record_id' }) clinicalRecord!: ClinicalRecord | null;
 @Column({ name: 'granted_by_user_id', type: 'uuid' }) grantedByUserId!: string; @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'granted_by_user_id' }) grantedBy!: User;
 @Column({ name: 'granted_at', type: 'timestamptz' }) grantedAt!: Date; @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt!: Date | null; @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
 @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date; @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
