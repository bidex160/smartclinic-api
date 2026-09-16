import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { appConfig } from '../config/app.config';
import { EMAIL_PROVIDER, EmailDeliveryError, EmailProvider, EmailSendOutcome } from './email/email-provider';
import { NotificationOutbox } from './entities/notification-outbox.entity';
import { NotificationOutboxChannel } from './enums/notification-outbox-channel.enum';
import { NotificationOutboxStatus } from './enums/notification-outbox-status.enum';
import { buildNotificationEmail } from './notification-email-content';

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_PROCESSING_STALE_AFTER_MS = 300_000;

@Injectable()
export class NotificationDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private interval: NodeJS.Timeout | null = null;
  private dispatchRunning = false;

  constructor(
    @InjectRepository(NotificationOutbox)
    private readonly outbox: Repository<NotificationOutbox>,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider,
  ) {}

  onModuleInit(): void {
    const notificationsConfig = this.config.notifications;
    if (!notificationsConfig.dispatcherEnabled) return;
    this.interval = setInterval(() => {
      this.dispatchPending().catch((error) => this.logger.warn(`Notification dispatch failed: ${this.safeErrorCode(error)}`));
    }, notificationsConfig.dispatchIntervalMs ?? DEFAULT_INTERVAL_MS);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async dispatchPending(batchSize = this.config.notifications.dispatchBatchSize ?? DEFAULT_BATCH_SIZE): Promise<{ processed: number }> {
    if (this.dispatchRunning) return { processed: 0 };
    this.dispatchRunning = true;
    try {
      const ids = await this.claimBatch(Math.max(1, batchSize));
      let processed = 0;
      for (const id of ids) {
        if (await this.processClaimed(id)) processed += 1;
      }
      return { processed };
    } finally {
      this.dispatchRunning = false;
    }
  }

  private async processClaimed(id: string): Promise<boolean> {
    try {
      const row = await this.outbox.findOne({
        where: { id },
        relations: { notification: { user: true } },
      });
      if (!row?.notification?.user) throw new EmailDeliveryError();
      const email = row.notification.user.emailNormalized || row.notification.user.email;
      if (!email) {
        row.status = NotificationOutboxStatus.SENT;
        row.errorCode = null;
        await this.outbox.save(row);
        return true;
      }
      const content = buildNotificationEmail(row.notification, this.config);
      const result = await this.emailProvider.sendTransactionalEmail({
        to: email,
        fromAddress: this.config.email.fromAddress,
        fromName: this.config.email.fromName,
        subject: content.subject,
        html: content.html,
        text: content.text,
        idempotencyKey: row.idempotencyKey,
      });
      row.status = result.outcome === EmailSendOutcome.SENT ? NotificationOutboxStatus.SENT : NotificationOutboxStatus.FAILED;
      row.errorCode = result.outcome === EmailSendOutcome.SENT ? null : 'EMAIL_PROVIDER_UNAVAILABLE';
      row.nextAttemptAt = row.status === NotificationOutboxStatus.FAILED ? this.nextRetryAt(row.attemptCount) : null;
      await this.outbox.save(row);
      return true;
    } catch (error) {
      await this.markFailed(id, this.safeErrorCode(error));
      return true;
    }
  }

  private async claimBatch(batchSize: number): Promise<string[]> {
    return this.outbox.manager.transaction(async (manager) => {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - this.processingStaleAfterMs());
      const repository = manager.getRepository(NotificationOutbox);
      const rows = await repository
        .createQueryBuilder('outbox')
        .where('outbox.channel = :channel', { channel: NotificationOutboxChannel.EMAIL })
        .andWhere('outbox.attemptCount < :maxAttempts', { maxAttempts: this.maxAttempts() })
        .andWhere(new Brackets((qb) => {
          qb.where('(outbox.status = :pending AND (outbox.nextAttemptAt IS NULL OR outbox.nextAttemptAt <= :now))', { pending: NotificationOutboxStatus.PENDING, now })
            .orWhere('(outbox.status = :failed AND outbox.nextAttemptAt <= :now)', { failed: NotificationOutboxStatus.FAILED, now })
            .orWhere('(outbox.status = :processing AND outbox.lastAttemptAt <= :staleBefore)', { processing: NotificationOutboxStatus.PROCESSING, staleBefore });
        }))
        .orderBy('outbox.createdAt', 'ASC')
        .addOrderBy('outbox.id', 'ASC')
        .limit(batchSize)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      for (const row of rows) {
        row.status = NotificationOutboxStatus.PROCESSING;
        row.attemptCount += 1;
        row.lastAttemptAt = now;
        row.errorCode = null;
        row.nextAttemptAt = null;
      }
      if (rows.length) await repository.save(rows);
      return rows.map((row) => row.id);
    });
  }

  private async markFailed(id: string, errorCode: string) {
    const row = await this.outbox.findOne({ where: { id } });
    if (!row) return;
    row.status = NotificationOutboxStatus.FAILED;
    row.errorCode = errorCode;
    row.nextAttemptAt = row.attemptCount >= this.maxAttempts() ? null : this.nextRetryAt(row.attemptCount);
    await this.outbox.save(row);
  }

  private nextRetryAt(attemptCount: number) {
    const seconds = Math.min(60 * 30, 30 * Math.max(1, attemptCount));
    return new Date(Date.now() + seconds * 1000);
  }

  private maxAttempts() {
    return this.config.notifications.emailMaxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  private processingStaleAfterMs() {
    return this.config.notifications.processingStaleAfterMs ?? DEFAULT_PROCESSING_STALE_AFTER_MS;
  }

  private safeErrorCode(error: unknown) {
    if (error instanceof EmailDeliveryError) return 'EMAIL_DELIVERY_FAILED';
    if (error instanceof Error && error.name) return error.name.slice(0, 120);
    return 'UNKNOWN_ERROR';
  }
}
