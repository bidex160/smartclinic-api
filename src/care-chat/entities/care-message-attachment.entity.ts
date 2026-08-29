import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PrivateAttachmentResourceType } from '../../common/storage/private-attachment-storage';
import { User } from '../../users/entities/user.entity';
import { CareConversation } from './care-conversation.entity';
import { CareMessage } from './care-message.entity';

@Entity('care_message_attachments')
@Index('UQ_care_message_attachments_reference', ['reference'], { unique: true })
@Index('IDX_care_message_attachments_pending', ['conversationId', 'uploadedByUserId', 'expiresAt'], { where: '"care_message_id" IS NULL' })
@Index('IDX_care_message_attachments_message', ['careMessageId'])
@Check('CHK_care_message_attachments_size', '"size_bytes" > 0 AND "size_bytes" <= 15728640')
@Check('CHK_care_message_attachments_binding', '("care_message_id" IS NULL AND "expires_at" IS NOT NULL) OR ("care_message_id" IS NOT NULL AND "expires_at" IS NULL)')
export class CareMessageAttachment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) reference!: string;
  @Column({ name: 'conversation_id', type: 'uuid' }) conversationId!: string;
  @ManyToOne(() => CareConversation, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'conversation_id' }) conversation!: CareConversation;
  @Column({ name: 'care_message_id', type: 'uuid', nullable: true }) careMessageId!: string | null;
  @ManyToOne(() => CareMessage, (message) => message.attachments, { nullable: true, onDelete: 'CASCADE' }) @JoinColumn({ name: 'care_message_id' }) careMessage!: CareMessage | null;
  @Column({ name: 'uploaded_by_user_id', type: 'uuid' }) uploadedByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'uploaded_by_user_id' }) uploadedBy!: User;
  @Column({ name: 'original_name', type: 'varchar', length: 255 }) originalName!: string;
  @Column({ name: 'mime_type', type: 'varchar', length: 64 }) mimeType!: string;
  @Column({ name: 'size_bytes', type: 'integer' }) sizeBytes!: number;
  @Column({ name: 'resource_type', type: 'varchar', length: 16 }) resourceType!: PrivateAttachmentResourceType;
  @Column({ name: 'storage_provider', type: 'varchar', length: 16, default: 'CLOUDINARY' }) storageProvider!: string;
  @Column({ name: 'storage_public_id', type: 'varchar', length: 255 }) storagePublicId!: string;
  @Column({ name: 'storage_resource_type', type: 'varchar', length: 16 }) storageResourceType!: string;
  @Column({ name: 'storage_version', type: 'bigint', nullable: true }) storageVersion!: string | null;
  @Column({ name: 'storage_format', type: 'varchar', length: 16, nullable: true }) storageFormat!: string | null;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
