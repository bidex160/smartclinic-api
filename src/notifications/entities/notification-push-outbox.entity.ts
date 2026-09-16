import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, Unique } from 'typeorm';

import { Notification } from './notification.entity';
import { UserPushDevice } from './user-push-device.entity';
import { NotificationOutboxStatus } from '../enums/notification-outbox-status.enum';

@Entity('notification_push_outbox')
@Unique('UQ_notification_push_outbox_notification_device', ['notificationId', 'deviceId'])
@Index('IDX_notification_push_outbox_pending', ['status', 'nextAttemptAt', 'createdAt'])
@Index('IDX_notification_push_outbox_processing', ['status', 'lastAttemptAt', 'createdAt'])
export class NotificationPushOutbox {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId!: string;

  @ManyToOne(() => Notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  notification!: Notification;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId!: string;

  @ManyToOne(() => UserPushDevice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device!: UserPushDevice;

  @Column({ type: 'text' })
  token!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

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
