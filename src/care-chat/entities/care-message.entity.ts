import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CareMessageSenderType } from '../enums/care-message-sender-type.enum';
import { CareConversation } from './care-conversation.entity';

@Entity('care_messages')
@Index('UQ_care_messages_reference', ['reference'], { unique: true })
@Index('IDX_care_messages_conversation_created', ['conversationId', 'createdAt', 'reference'])
@Index('IDX_care_messages_unread', ['conversationId', 'senderType'], { where: '"read_at" IS NULL' })
@Check('CHK_care_messages_body', 'char_length("body") BETWEEN 1 AND 4000 AND "body" = btrim("body")')
export class CareMessage {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) reference!: string;
  @Column({ name: 'conversation_id', type: 'uuid' }) conversationId!: string;
  @ManyToOne(() => CareConversation, (conversation) => conversation.messages, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'conversation_id' }) conversation!: CareConversation;
  @Column({ name: 'sender_type', type: 'enum', enum: CareMessageSenderType, enumName: 'care_message_sender_type_enum' }) senderType!: CareMessageSenderType;
  @Column({ name: 'sender_user_id', type: 'uuid' }) senderUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'sender_user_id' }) senderUser!: User;
  @Column({ type: 'varchar', length: 4000 }) body!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true }) readAt!: Date | null;
}
