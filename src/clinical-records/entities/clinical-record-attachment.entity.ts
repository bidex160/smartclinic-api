import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ClinicalAttachmentResourceType } from '../enums/clinical-attachment-resource-type.enum';
import { ClinicalAttachmentStorageProvider } from '../enums/clinical-attachment-storage-provider.enum';
import { ClinicalRecord } from './clinical-record.entity';

@Entity('clinical_record_attachments')
@Index('UQ_clinical_record_attachments_reference', ['reference'], { unique: true })
@Index('IDX_clinical_record_attachments_record_created', ['clinicalRecordId', 'createdAt'])
@Check('CHK_clinical_record_attachments_size', '"size_bytes" > 0 AND "size_bytes" <= 15728640')
export class ClinicalRecordAttachment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) reference!: string;
  @Column({ name: 'clinical_record_id', type: 'uuid' }) clinicalRecordId!: string;
  @ManyToOne(() => ClinicalRecord, (record) => record.attachments, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'clinical_record_id' }) clinicalRecord!: ClinicalRecord;
  @Column({ name: 'uploaded_by_user_id', type: 'uuid' }) uploadedByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'uploaded_by_user_id' }) uploadedBy!: User;
  @Column({ name: 'original_name', type: 'varchar', length: 255 }) originalName!: string;
  @Column({ name: 'mime_type', type: 'varchar', length: 64 }) mimeType!: string;
  @Column({ name: 'size_bytes', type: 'integer' }) sizeBytes!: number;
  @Column({ name: 'resource_type', type: 'enum', enum: ClinicalAttachmentResourceType, enumName: 'clinical_attachment_resource_type_enum' }) resourceType!: ClinicalAttachmentResourceType;
  @Column({ name: 'storage_provider', type: 'enum', enum: ClinicalAttachmentStorageProvider, enumName: 'clinical_attachment_storage_provider_enum' }) storageProvider!: ClinicalAttachmentStorageProvider;
  @Column({ name: 'storage_public_id', type: 'varchar', length: 255 }) storagePublicId!: string;
  @Column({ name: 'storage_resource_type', type: 'varchar', length: 16 }) storageResourceType!: string;
  @Column({ name: 'storage_version', type: 'bigint', nullable: true }) storageVersion!: string | null;
  @Column({ name: 'storage_format', type: 'varchar', length: 16, nullable: true }) storageFormat!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
