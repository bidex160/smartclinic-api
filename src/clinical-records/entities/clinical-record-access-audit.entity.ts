import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity'; import { Provider } from '../../providers/entities/provider.entity'; import { User } from '../../users/entities/user.entity';
import { ClinicalRecordAccessAction } from '../enums/clinical-record-access-action.enum'; import { ClinicalRecordAccessGrant } from './clinical-record-access-grant.entity'; import { ClinicalRecord } from './clinical-record.entity';
@Entity('clinical_record_access_audit')
@Index('IDX_clinical_record_access_audit_patient_created', ['patientId', 'createdAt']) @Index('IDX_clinical_record_access_audit_provider_created', ['providerId', 'createdAt']) @Index('IDX_clinical_record_access_audit_record_created', ['clinicalRecordId', 'createdAt'])
export class ClinicalRecordAccessAudit {
 @PrimaryGeneratedColumn('uuid') id!: string; @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string; @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
 @Column({ name: 'clinical_record_id', type: 'uuid' }) clinicalRecordId!: string; @ManyToOne(() => ClinicalRecord, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'clinical_record_id' }) clinicalRecord!: ClinicalRecord;
 @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string; @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
 @Column({ name: 'user_id', type: 'uuid' }) userId!: string; @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User;
 @Column({ name: 'grant_id', type: 'uuid', nullable: true }) grantId!: string | null; @ManyToOne(() => ClinicalRecordAccessGrant, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'grant_id' }) grant!: ClinicalRecordAccessGrant | null;
 @Column({ type: 'enum', enum: ClinicalRecordAccessAction, enumName: 'clinical_record_access_action_enum' }) action!: ClinicalRecordAccessAction; @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
