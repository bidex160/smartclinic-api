import { Injectable } from '@nestjs/common';
import { EmailProvider, EmailSendOutcome, TransactionalEmailMessage } from './email-provider';

@Injectable()
export class TestEmailProvider implements EmailProvider {
  readonly messages: TransactionalEmailMessage[] = [];
  async sendTransactionalEmail(message: TransactionalEmailMessage): Promise<{ outcome: EmailSendOutcome }> {
    this.messages.push({ ...message });
    return { outcome: EmailSendOutcome.SENT };
  }
}
