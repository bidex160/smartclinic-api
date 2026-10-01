import { ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService, ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, Repository } from 'typeorm';

import { appConfig } from '../config/app.config';
import { decryptSecret, encryptSecret, generateWebhookSecret, isAllowedWebhookUrl, signWebhook } from './integration-crypto';
import { ProviderWebhookDelivery, WebhookDeliveryStatus } from './provider-webhook-delivery.entity';
import { ProviderWebhook } from './provider-webhook.entity';

export type WebhookEventType =
  | 'request.patient_responded'
  | 'request.updated'
  | 'request.results_ready'
  | 'handoff.received'
  | 'ping';

const MAX_ATTEMPTS = 8;
const TIMEOUT_MS = 10_000;
const INTERVAL_MS = 15_000;

/**
 * Signed updates to a facility's own system. Events carry references and
 * statuses only; the receiving system fetches details with its API key.
 */
@Injectable()
export class ProviderWebhooksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderWebhooksService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(ProviderWebhook) private readonly webhooks: Repository<ProviderWebhook>,
    @InjectRepository(ProviderWebhookDelivery) private readonly deliveries: Repository<ProviderWebhookDelivery>,
    private readonly configService: ConfigService,
    @Optional() @Inject(appConfig.KEY) private readonly config?: ConfigType<typeof appConfig>,
  ) {}

  onModuleInit(): void {
    if (!this.config?.notifications?.dispatcherEnabled) return;
    this.timer = setInterval(() => void this.dispatchDue().catch(() => this.logger.warn('Webhook dispatch failed')), INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get available(): boolean {
    return !!this.masterKey();
  }

  async get(providerId: string) {
    const hook = await this.webhooks.findOne({ where: { providerId } });
    return hook ? { url: hook.url, isActive: hook.isActive, createdAt: hook.createdAt, updatedAt: hook.updatedAt } : null;
  }

  /** Sets the URL. A new signing secret is returned only when one is created (first time or on rotate). */
  async set(providerId: string, userId: string, url: string, rotateSecret = false) {
    const master = this.requireMasterKey();
    if (!isAllowedWebhookUrl(url)) throw new ConflictException('Use a public https URL (port 443) for your webhook');
    let hook = await this.webhooks.findOne({ where: { providerId } });
    let secret: string | null = null;
    if (!hook || rotateSecret) {
      secret = generateWebhookSecret();
      const sealed = encryptSecret(master, secret);
      hook = this.webhooks.merge(hook ?? this.webhooks.create({ providerId, createdByUserId: userId }), {
        secretCiphertext: sealed.ciphertext,
        secretIv: sealed.iv,
        secretAuthTag: sealed.authTag,
      });
    }
    hook.url = url;
    hook.isActive = true;
    hook = await this.webhooks.save(hook);
    return { url: hook.url, isActive: hook.isActive, signingSecret: secret };
  }

  async remove(providerId: string) {
    const hook = await this.webhooks.findOne({ where: { providerId } });
    if (hook) await this.webhooks.remove(hook);
    return { removed: true as const };
  }

  async test(providerId: string) {
    const hook = await this.webhooks.findOne({ where: { providerId, isActive: true } });
    if (!hook) throw new NotFoundException('Set a webhook URL first');
    await this.emit(this.webhooks.manager, providerId, 'ping', { message: 'Hello from SmartClinic' });
    await this.dispatchDue(5);
    return this.recent(providerId);
  }

  async recent(providerId: string) {
    const hook = await this.webhooks.findOne({ where: { providerId } });
    if (!hook) return { items: [] };
    const rows = await this.deliveries.find({ where: { webhookId: hook.id }, order: { createdAt: 'DESC' }, take: 20 });
    return { items: rows.map((r) => ({ id: r.id, eventType: r.eventType, status: r.status, attemptCount: r.attemptCount, lastStatusCode: r.lastStatusCode, createdAt: r.createdAt, deliveredAt: r.deliveredAt })) };
  }

  /**
   * Queues an event after the change it describes has committed. Never throws:
   * a facility's webhook must not block a patient or provider action.
   */
  notify(providerId: string | null | undefined, type: WebhookEventType, data: Record<string, unknown>): void {
    if (!providerId) return;
    void this.emit(this.webhooks.manager, providerId, type, data).catch(() =>
      this.logger.warn(`Webhook event ${type} could not be queued`),
    );
  }

  /** Queues an event in the caller's transaction, if the provider has an active webhook. */
  async emit(manager: EntityManager, providerId: string, type: WebhookEventType, data: Record<string, unknown>): Promise<void> {
    const hook = await manager.getRepository(ProviderWebhook).findOne({ where: { providerId, isActive: true } });
    if (!hook) return;
    const id = `evt_${randomUUID().replaceAll('-', '')}`;
    await manager.getRepository(ProviderWebhookDelivery).save({
      webhookId: hook.id,
      eventType: type,
      payload: { id, type, createdAt: new Date().toISOString(), data },
      status: WebhookDeliveryStatus.PENDING,
      attemptCount: 0,
      nextAttemptAt: new Date(),
      lastStatusCode: null,
      deliveredAt: null,
    });
  }

  async dispatchDue(limit = 25): Promise<{ sent: number }> {
    if (this.running) return { sent: 0 };
    this.running = true;
    try {
      // Claim due rows so several API instances don't send the same event at once.
      const claimed: { id: string }[] = await this.deliveries.query(
        `UPDATE "provider_webhook_deliveries" SET "next_attempt_at" = now() + interval '2 minutes'
         WHERE "id" IN (SELECT "id" FROM "provider_webhook_deliveries" WHERE "status" = 'PENDING' AND "next_attempt_at" <= now() ORDER BY "next_attempt_at" LIMIT $1 FOR UPDATE SKIP LOCKED)
         RETURNING "id"`,
        [limit],
      );
      let sent = 0;
      for (const { id } of claimed) if (await this.deliver(id)) sent += 1;
      return { sent };
    } finally {
      this.running = false;
    }
  }

  private async deliver(id: string): Promise<boolean> {
    const row = await this.deliveries.findOne({ where: { id }, relations: { webhook: true } });
    if (!row || row.status !== WebhookDeliveryStatus.PENDING || !row.webhook?.isActive) return false;
    const master = this.masterKey();
    if (!master) return false;
    const body = JSON.stringify(row.payload);
    let secret: string;
    try {
      secret = decryptSecret(master, row.webhook.secretCiphertext, row.webhook.secretIv, row.webhook.secretAuthTag);
    } catch {
      // The encryption key changed: the facility must save its webhook again to get a new secret.
      this.logger.warn(`Webhook secret for delivery ${row.id} could not be decrypted`);
      row.status = WebhookDeliveryStatus.FAILED;
      row.nextAttemptAt = null;
      await this.deliveries.save(row);
      return false;
    }
    let status = 0;
    try {
      const response = await fetch(row.webhook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'SmartClinic-Webhooks/1',
          'x-smartclinic-event': row.eventType,
          'x-smartclinic-delivery': row.id,
          'x-smartclinic-signature': signWebhook(secret, body, Math.floor(Date.now() / 1000)),
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
    } catch {
      status = 0;
    }
    row.attemptCount += 1;
    row.lastStatusCode = status || null;
    if (status >= 200 && status < 300) {
      row.status = WebhookDeliveryStatus.DELIVERED;
      row.deliveredAt = new Date();
      row.nextAttemptAt = null;
    } else if (row.attemptCount >= MAX_ATTEMPTS) {
      row.status = WebhookDeliveryStatus.FAILED;
      row.nextAttemptAt = null;
    } else {
      // 30s, 1m, 2m, 4m … capped at 6 hours.
      row.nextAttemptAt = new Date(Date.now() + Math.min(30_000 * 2 ** (row.attemptCount - 1), 6 * 60 * 60 * 1000));
    }
    await this.deliveries.save(row);
    return row.status === WebhookDeliveryStatus.DELIVERED;
  }

  private masterKey(): string | null {
    return this.configService.get<string>('INTEGRATION_ENCRYPTION_KEY') || null;
  }

  private requireMasterKey(): string {
    const key = this.masterKey();
    if (!key) throw new ServiceUnavailableException('Webhooks are not available yet. Ask SmartClinic to enable them.');
    return key;
  }
}
