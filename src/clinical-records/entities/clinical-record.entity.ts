import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CareAppointment } from '../../care-appointments/entities/care-appointment.entity';
import { CareRequest } from '../../care-requests/entities/care-request.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { CareServiceDefinition } from '../../providers/entities/care-service-definition.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { User } from '../../users/entities/user.entity';
import { ClinicalRecordStatus } from '../enums/clinical-record-status.enum';
import { ClinicalRecordType } from '../enums/clinical-record-type.enum';
import { ClinicalConsultationDetail } from './clinical-consultation-detail.entity';
import { ClinicalRecordAttachment } from './clinical-record-attachment.entity';
import { ClinicalDocumentationSnapshot } from '../clinical-documentation-template';

@Entity('clinical_records')
@Index('UQ_clinical_records_reference', ['reference'], { unique: true })
@Index('UQ_clinical_records_care_appointment', ['careAppointmentId'], { unique: true, where: '"care_appointment_id" IS NOT NULL' })
@Index('IDX_clinical_records_patient_status_occurred', ['patientId', 'status', 'occurredAt'])
@Index('IDX_clinical_records_provider_status_created', ['providerId', 'status', 'createdAt'])
@Index('IDX_clinical_records_care_request', ['careRequestId'])
@Check('CHK_clinical_records_finalized_at', '("status" = \'DRAFT\' AND "finalized_at" IS NULL) OR ("status" = \'FINALIZED\' AND "finalized_at" IS NOT NULL)')
export class ClinicalRecord {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) reference!: string;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'care_request_id', type: 'uuid', nullable: true }) careRequestId!: string | null;
  @ManyToOne(() => CareRequest, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'care_request_id' }) careRequest!: CareRequest | null;
  @Column({ name: 'care_appointment_id', type: 'uuid', nullable: true }) careAppointmentId!: string | null;
  @OneToOne(() => CareAppointment, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'care_appointment_id' }) careAppointment!: CareAppointment | null;
  @Column({ name: 'care_service_definition_id', type: 'uuid', nullable: true }) careServiceDefinitionId!: string | null;
  @ManyToOne(() => CareServiceDefinition, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'care_service_definition_id' }) careServiceDefinition!: CareServiceDefinition | null;
  @Column({ name: 'record_type', type: 'enum', enum: ClinicalRecordType, enumName: 'clinical_record_type_enum' }) recordType!: ClinicalRecordType;
  @Column({ name: 'documentation_template_snapshot', type: 'jsonb', nullable: true }) documentationTemplateSnapshot!: ClinicalDocumentationSnapshot | null;
  @Column({ name: 'structured_data', type: 'jsonb', nullable: true }) structuredData!: Record<string, unknown> | null;
  @Column({ type: 'varchar', length: 200 }) title!: string;
  @Column({ type: 'text', nullable: true }) summary!: string | null;
  @Column({ type: 'enum', enum: ClinicalRecordStatus, enumName: 'clinical_record_status_enum' }) status!: ClinicalRecordStatus;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true }) finalizedAt!: Date | null;
  @Column({ name: 'created_by_user_id', type: 'uuid' }) createdByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdBy!: User;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToOne(() => ClinicalConsultationDetail, (detail) => detail.clinicalRecord) consultation!: ClinicalConsultationDetail | null;
  @OneToMany(() => ClinicalRecordAttachment, (attachment) => attachment.clinicalRecord) attachments!: ClinicalRecordAttachment[];
}
