import { BeforeInsert, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { randomBytes } from 'node:crypto';

import { User } from '../../users/entities/user.entity';
import { NotificationActionType } from '../enums/notification-action-type.enum';
import { NotificationEntityType } from '../enums/notification-entity-type.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationOutbox } from './notification-outbox.entity';

@Entity('notifications')
@Index('UQ_notifications_reference', ['reference'], { unique: true })
@Index('UQ_notifications_idempotency_key', ['idempotencyKey'], { unique: true, where: '"idempotency_key" IS NOT NULL' })
@Index('IDX_notifications_user_created', ['userId', 'createdAt'])
@Index('IDX_notifications_user_read_created', ['userId', 'readAt', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40 })
  reference!: string;

  @BeforeInsert()
  generateReference(): void {
    if (!this.reference) this.reference = `SC-NOT-${randomBytes(10).toString('hex').toUpperCase()}`;
  }

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 80 })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 80 })
  entityType!: NotificationEntityType;

  @Column({ name: 'entity_reference', type: 'varchar', length: 120 })
  entityReference!: string;

  @Column({ name: 'action_type', type: 'varchar', length: 40 })
  actionType!: NotificationActionType;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 220, nullable: true })
  idempotencyKey!: string | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => NotificationOutbox, (outbox) => outbox.notification)
  outboxEntries!: NotificationOutbox[];
}

