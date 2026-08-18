export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface TransactionalEmailMessage {
  to: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  html: string;
  text: string;
}

export enum EmailSendOutcome { SENT = 'SENT', UNAVAILABLE = 'UNAVAILABLE' }

export interface EmailProvider {
  sendTransactionalEmail(message: TransactionalEmailMessage): Promise<{ outcome: EmailSendOutcome }>;
}
