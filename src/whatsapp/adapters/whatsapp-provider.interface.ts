export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface SendWhatsAppTextInput { to: string; text: string }
export interface SendWhatsAppResult { providerMessageId: string | null }
/** A pre-approved message template: the only way to message someone who hasn't written in the last 24 hours. */
export interface SendWhatsAppTemplateInput {
  to: string; template: string; language: string; bodyParams: string[];
  /** Authentication templates: the one-time code for the copy-code / one-tap button. */
  codeButton?: string;
}

export interface WhatsAppProvider {
  sendText(input: SendWhatsAppTextInput): Promise<SendWhatsAppResult>;
  sendTemplate?(input: SendWhatsAppTemplateInput): Promise<SendWhatsAppResult>;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}

export class WhatsAppDeliveryError extends Error {
  constructor() { super('WhatsApp delivery failed'); this.name = 'WhatsAppDeliveryError'; }
}
