export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface SendWhatsAppTextInput { to: string; text: string }
export interface SendWhatsAppResult { providerMessageId: string | null }

export interface WhatsAppProvider {
  sendText(input: SendWhatsAppTextInput): Promise<SendWhatsAppResult>;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}

export class WhatsAppDeliveryError extends Error {
  constructor() { super('WhatsApp delivery failed'); this.name = 'WhatsAppDeliveryError'; }
}
