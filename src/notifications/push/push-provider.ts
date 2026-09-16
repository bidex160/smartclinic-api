export const PUSH_PROVIDER = 'PUSH_PROVIDER';

export interface PushMessage {
  token: string;
  notification: { title: string; body: string };
  data: Record<string, string>;
}

export enum PushSendOutcome {
  SENT = 'SENT',
  INVALID_TOKEN = 'INVALID_TOKEN',
  RETRYABLE_FAILURE = 'RETRYABLE_FAILURE',
}

export interface PushProvider {
  send(message: PushMessage): Promise<PushSendOutcome>;
}

export class PushDeliveryError extends Error {
  constructor(public readonly outcome: PushSendOutcome, message = 'Push delivery failed') {
    super(message);
    this.name = 'PushDeliveryError';
  }
}
