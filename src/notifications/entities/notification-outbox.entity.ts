import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { NotificationOutboxChannel } from '../enums/notification-outbox-channel.enum';
import { NotificationOutboxStatus } from '../enums/notification-outbox-status.enum';
import { Notification } from './notification.entity';

@Entity('notification_outbox')
@Index('UQ_notification_outbox_idempotency_key', ['idempotencyKey'], { unique: true })
@Index('IDX_notification_outbox_pending', ['status', 'nextAttemptAt', 'createdAt'])
@Index('IDX_notification_outbox_processing', ['status', 'lastAttemptAt', 'createdAt'])
export class NotificationOutbox {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId!: string;

  @ManyToOne(() => Notification, (notification) => notification.outboxEntries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  notification!: Notification;

  @Column({ type: 'varchar', length: 40 })
  channel!: NotificationOutboxChannel;

  @Column({ type: 'varchar', length: 40 })
  status!: NotificationOutboxStatus;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt!: Date | null;

  @Column({ name: 'error_code', type: 'varchar', length: 120, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 240 })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
