import { Logger } from '@nestjs/common';

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsProvider {
  readonly name: string;
  /** `to` is in international form, e.g. +2348031234567. Resolves true when the provider accepted it. */
  send(to: string, text: string): Promise<boolean>;
}

/**
 * Termii (Nigeria). Uses the "dnd" route so codes reach numbers on Do-Not-Disturb, which needs a
 * sender ID approved by Termii. https://developers.termii.com/messaging-api
 */
export class TermiiSmsProvider implements SmsProvider {
  readonly name = 'termii';
  constructor(private readonly apiKey: string, private readonly senderId: string, private readonly baseUrl = 'https://api.ng.termii.com', private readonly fetchImpl: typeof fetch = fetch) {}

  async send(to: string, text: string): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/api/sms/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: this.apiKey, to: to.replace(/^\+/, ''), from: this.senderId, sms: text, type: 'plain', channel: 'dnd' }),
        signal: AbortSignal.timeout(15_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/** Africa's Talking (Rwanda, Ghana and Nigeria). https://developers.africastalking.com/docs/sms/sending */
export class AfricasTalkingSmsProvider implements SmsProvider {
  readonly name = 'africastalking';
  constructor(private readonly username: string, private readonly apiKey: string, private readonly senderId: string | null, private readonly fetchImpl: typeof fetch = fetch) {}

  async send(to: string, text: string): Promise<boolean> {
    const host = this.username === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
    const form = new URLSearchParams({ username: this.username, to, message: text });
    if (this.senderId) form.set('from', this.senderId);
    try {
      const res = await this.fetchImpl(`${host}/version1/messaging`, {
        method: 'POST',
        headers: { apiKey: this.apiKey, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return false;
      const body = (await res.json().catch(() => null)) as { SMSMessageData?: { Recipients?: { status?: string }[] } } | null;
      return body?.SMSMessageData?.Recipients?.[0]?.status === 'Success';
    } catch {
      return false;
    }
  }
}

/** Local development and tests: writes nothing anywhere, keeps the last messages in memory. */
export class TestSmsProvider implements SmsProvider {
  readonly name = 'test';
  readonly sent: { to: string; text: string }[] = [];
  private readonly logger = new Logger('TestSmsProvider');
  async send(to: string, text: string): Promise<boolean> {
    this.sent.push({ to, text });
    if (this.sent.length > 50) this.sent.shift();
    this.logger.log(`SMS to ${to.slice(0, 6)}…: ${text}`);
    return true;
  }
}

export function smsProviderFromEnv(env: Record<string, string | undefined>): SmsProvider | null {
  const which = (env['SMS_PROVIDER'] ?? '').toLowerCase();
  if (which === 'termii' && env['TERMII_API_KEY'] && env['TERMII_SENDER_ID']) return new TermiiSmsProvider(env['TERMII_API_KEY'], env['TERMII_SENDER_ID'], env['TERMII_BASE_URL'] || undefined);
  if (which === 'africastalking' && env['AFRICASTALKING_USERNAME'] && env['AFRICASTALKING_API_KEY']) return new AfricasTalkingSmsProvider(env['AFRICASTALKING_USERNAME'], env['AFRICASTALKING_API_KEY'], env['AFRICASTALKING_SENDER_ID'] || null);
  if (which === 'test' && env['NODE_ENV'] !== 'production') return new TestSmsProvider();
  return null;
}
