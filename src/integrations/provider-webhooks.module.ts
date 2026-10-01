import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProviderWebhookDelivery } from './provider-webhook-delivery.entity';
import { ProviderWebhook } from './provider-webhook.entity';
import { ProviderWebhooksService } from './provider-webhooks.service';

/** Webhook storage and delivery; imported by modules that emit events. */
@Module({
  imports: [TypeOrmModule.forFeature([ProviderWebhook, ProviderWebhookDelivery])],
  providers: [ProviderWebhooksService],
  exports: [ProviderWebhooksService],
})
export class ProviderWebhooksModule {}
