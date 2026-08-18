import { Injectable } from '@nestjs/common';
import { EmailProvider, EmailSendOutcome, TransactionalEmailMessage } from './email-provider';

@Injectable()
export class UnavailableEmailProvider implements EmailProvider {
  async sendTransactionalEmail(_message: TransactionalEmailMessage): Promise<{ outcome: EmailSendOutcome }> {
    return { outcome: EmailSendOutcome.UNAVAILABLE };
  }
}
