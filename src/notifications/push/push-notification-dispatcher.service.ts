import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Brackets, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { appConfig } from '../../config/app.config';
import { NotificationPushOutbox } from '../entities/notification-push-outbox.entity';
import { NotificationOutboxStatus } from '../enums/notification-outbox-status.enum';
import { PushDevicesService } from './push-devices.service';
import { PushDeliveryError, PushProvider, PUSH_PROVIDER, PushSendOutcome } from './push-provider';

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_STALE_AFTER_MS = 300_000;

@Injectable()
export class PushNotificationDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushNotificationDispatcherService.name);
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(NotificationPushOutbox) private readonly outbox: Repository<NotificationPushOutbox>,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
    private readonly devices: PushDevicesService,
  ) {}

  onModuleInit(): void {
    if (!this.config.notifications.dispatcherEnabled) return;
    this.interval = setInterval(() => { this.dispatchPending().catch((error) => this.logger.warn(`Push dispatch failed: ${this.safeErrorCode(error)}`)); }, this.config.notifications.dispatchIntervalMs ?? DEFAULT_INTERVAL_MS);
    this.interval.unref?.();
  }

  onModuleDestroy(): void { if (this.interval) clearInterval(this.interval); }

  async dispatchPending(batchSize = this.config.notifications.dispatchBatchSize ?? DEFAULT_BATCH_SIZE): Promise<{ processed: number }> {
    if (this.running) return { processed: 0 };
    this.running = true;
    try {
      const ids = await this.claimBatch(Math.max(1, batchSize));
      let processed = 0;
      for (const id of ids) { if (await this.processClaimed(id)) processed += 1; }
      return { processed };
    } finally { this.running = false; }
  }

  private async processClaimed(id: string): Promise<boolean> {
    const row = await this.outbox.findOne({ where: { id } });
    if (!row) return false;
    try {
      const outcome = await this.provider.send({
        token: row.token,
        notification: { title: String(row.payload.title ?? 'SmartClinic'), body: String(row.payload.body ?? '') },
        data: Object.fromEntries(Object.entries(row.payload).filter(([key, value]) => key !== 'title' && key !== 'body' && value != null).map(([key, value]) => [key, String(value)])),
      });
      if (outcome === PushSendOutcome.INVALID_TOKEN) {
        await this.devices.deactivate(row.deviceId, row.token);
        row.status = NotificationOutboxStatus.SENT;
        row.errorCode = 'PUSH_TOKEN_INVALID';
      } else if (outcome === PushSendOutcome.SENT) {
        row.status = NotificationOutboxStatus.SENT;
        row.errorCode = null;
      } else {
        throw new PushDeliveryError(PushSendOutcome.RETRYABLE_FAILURE);
      }
      row.nextAttemptAt = null;
      await this.outbox.save(row);
      return true;
    } catch (error) {
      if (error instanceof PushDeliveryError && error.outcome === PushSendOutcome.INVALID_TOKEN) {
        await this.devices.deactivate(row.deviceId, row.token);
        row.status = NotificationOutboxStatus.SENT;
        row.errorCode = 'PUSH_TOKEN_INVALID';
        row.nextAttemptAt = null;
        await this.outbox.save(row);
        return true;
      }
      row.status = NotificationOutboxStatus.FAILED;
      row.errorCode = this.safeErrorCode(error);
      row.nextAttemptAt = row.attemptCount >= this.maxAttempts() ? null : this.nextRetryAt(row.attemptCount);
      await this.outbox.save(row);
      return true;
    }
  }

  private async claimBatch(batchSize: number): Promise<string[]> {
    return this.outbox.manager.transaction(async (manager) => {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - (this.config.notifications.processingStaleAfterMs ?? DEFAULT_STALE_AFTER_MS));
      const repository = manager.getRepository(NotificationPushOutbox);
      const rows = await repository.createQueryBuilder('outbox')
        .where('outbox.attemptCount < :maxAttempts', { maxAttempts: this.maxAttempts() })
        .andWhere(new Brackets((qb) => qb
          .where('(outbox.status = :pending AND (outbox.nextAttemptAt IS NULL OR outbox.nextAttemptAt <= :now))', { pending: NotificationOutboxStatus.PENDING, now })
          .orWhere('(outbox.status = :failed AND outbox.nextAttemptAt <= :now)', { failed: NotificationOutboxStatus.FAILED, now })
          .orWhere('(outbox.status = :processing AND outbox.lastAttemptAt <= :staleBefore)', { processing: NotificationOutboxStatus.PROCESSING, staleBefore })))
        .orderBy('outbox.createdAt', 'ASC').addOrderBy('outbox.id', 'ASC').limit(batchSize)
        .setLock('pessimistic_write').setOnLocked('skip_locked').getMany();
      for (const row of rows) { row.status = NotificationOutboxStatus.PROCESSING; row.attemptCount += 1; row.lastAttemptAt = now; row.errorCode = null; row.nextAttemptAt = null; }
      if (rows.length) await repository.save(rows);
      return rows.map((row) => row.id);
    });
  }

  private maxAttempts(): number { return this.config.notifications.push.maxAttempts; }
  private nextRetryAt(attemptCount: number): Date { return new Date(Date.now() + Math.min(30 * 60, 30 * Math.max(1, attemptCount)) * 1000); }
  private safeErrorCode(error: unknown): string { return error instanceof PushDeliveryError ? error.outcome : error instanceof Error && error.name ? error.name.slice(0, 120) : 'PUSH_DELIVERY_FAILED'; }
}
