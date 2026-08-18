import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Resend } from 'resend';
import { appConfig } from '../../config/app.config';
import { EmailDeliveryError, EmailProvider, EmailSendOutcome, TransactionalEmailMessage } from './email-provider';

export const RESEND_CLIENT = Symbol('RESEND_CLIENT');
export type ResendClient = Pick<Resend, 'emails'>;

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  constructor(@Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>, @Inject(RESEND_CLIENT) private readonly resend: ResendClient | null) {}

  async sendTransactionalEmail(message: TransactionalEmailMessage): Promise<{ outcome: EmailSendOutcome }> {
    if (!this.resend) throw new EmailDeliveryError();
    const from = message.fromName?.trim() ? `${message.fromName.trim()} <${message.fromAddress}>` : message.fromAddress;
    let timeout: NodeJS.Timeout | undefined;
    try {
      const response = await Promise.race([
        this.resend.emails.send(
          { from, to: message.to, subject: message.subject, html: message.html, text: message.text },
          message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined,
        ),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new EmailDeliveryError()), this.config.email.sendTimeoutMs); }),
      ]);
      if (response.error || !response.data) throw new EmailDeliveryError();
      return { outcome: EmailSendOutcome.SENT };
    } catch {
      throw new EmailDeliveryError();
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
