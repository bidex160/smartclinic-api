import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WhatsAppIdentity } from './whatsapp-identity.entity';
import { WhatsAppMessageDirection, WhatsAppMessageStatus, WhatsAppProviderCode } from '../whatsapp.types';

@Entity('whatsapp_messages')
@Index('UQ_whatsapp_messages_provider_message', ['provider', 'providerMessageId'], { unique: true, where: '"provider_message_id" IS NOT NULL' })
@Index('IDX_whatsapp_messages_identity_created', ['identityId', 'createdAt'])
export class WhatsAppMessage {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'identity_id', type: 'uuid' }) identityId!: string;
  @ManyToOne(() => WhatsAppIdentity, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'identity_id' }) identity!: WhatsAppIdentity;
  @Column({ type: 'enum', enum: WhatsAppProviderCode, enumName: 'whatsapp_provider_enum' }) provider!: WhatsAppProviderCode;
  @Column({ type: 'enum', enum: WhatsAppMessageDirection, enumName: 'whatsapp_message_direction_enum' }) direction!: WhatsAppMessageDirection;
  @Column({ name: 'provider_message_id', type: 'varchar', length: 128, nullable: true }) providerMessageId!: string | null;
  @Column({ name: 'message_type', type: 'varchar', length: 32 }) messageType!: string;
  @Column({ type: 'enum', enum: WhatsAppMessageStatus, enumName: 'whatsapp_message_status_enum' }) status!: WhatsAppMessageStatus;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
