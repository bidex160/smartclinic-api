export enum WhatsAppProviderCode { META = 'META' }
export enum WhatsAppIdentityStatus { UNLINKED = 'UNLINKED', LINKED = 'LINKED', DISABLED = 'DISABLED' }
export enum WhatsAppMessageDirection { INBOUND = 'INBOUND', OUTBOUND = 'OUTBOUND' }
export enum WhatsAppMessageStatus { RECEIVED = 'RECEIVED', SENT = 'SENT', FAILED = 'FAILED' }

export interface MetaInboundMessage {
  providerMessageId: string;
  providerUserId: string;
  messageType: string;
  occurredAt: Date;
}

export interface MetaWebhookPayload {
  object?: unknown;
  entry?: Array<{ changes?: Array<{ field?: unknown; value?: { messages?: Array<{ id?: unknown; from?: unknown; timestamp?: unknown; type?: unknown }> } }> }>;
}
