import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { ProviderWebhook } from './provider-webhook.entity';

export enum WebhookDeliveryStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

/** One event to send, retried with backoff until delivered or out of attempts. */
@Entity('provider_webhook_deliveries')
@Index('IDX_provider_webhook_deliveries_due', ['status', 'nextAttemptAt'])
@Index('IDX_provider_webhook_deliveries_webhook_created', ['webhookId', 'createdAt'])
export class ProviderWebhookDelivery {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'webhook_id', type: 'uuid' }) webhookId!: string;
  @ManyToOne(() => ProviderWebhook, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'webhook_id' }) webhook!: ProviderWebhook;
  @Column({ name: 'event_type', type: 'varchar', length: 60 }) eventType!: string;
  @Column({ type: 'jsonb' }) payload!: Record<string, unknown>;
  @Column({ type: 'varchar', length: 20 }) status!: WebhookDeliveryStatus;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 }) attemptCount!: number;
  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true }) nextAttemptAt!: Date | null;
  @Column({ name: 'last_status_code', type: 'integer', nullable: true }) lastStatusCode!: number | null;
  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true }) deliveredAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
