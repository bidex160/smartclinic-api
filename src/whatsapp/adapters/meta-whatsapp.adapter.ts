import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '../../config/app.config';
import { SendWhatsAppResult, SendWhatsAppTextInput, WhatsAppDeliveryError, WhatsAppProvider } from './whatsapp-provider.interface';

@Injectable()
export class MetaWhatsAppAdapter implements WhatsAppProvider {
  constructor(@Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>) {}

  async sendText(input: SendWhatsAppTextInput): Promise<SendWhatsAppResult> {
    const settings = this.config.whatsapp;
    if (!settings.enabled || !settings.accessToken || !settings.phoneNumberId) throw new WhatsAppDeliveryError();
    try {
      const response = await fetch(`${settings.graphApiBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(settings.graphApiVersion)}/${encodeURIComponent(settings.phoneNumberId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: input.to.replace(/^\+/, ''), type: 'text', text: { preview_url: false, body: input.text } }),
        signal: AbortSignal.timeout(settings.sendTimeoutMs),
      });
      if (!response.ok) throw new WhatsAppDeliveryError();
      const body = await response.json() as { messages?: Array<{ id?: unknown }> };
      return { providerMessageId: typeof body.messages?.[0]?.id === 'string' ? body.messages[0].id : null };
    } catch {
      throw new WhatsAppDeliveryError();
    }
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.whatsapp.appSecret;
    if (!secret) return true;
    if (!/^sha256=[a-f\d]{64}$/i.test(signature)) return false;
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
