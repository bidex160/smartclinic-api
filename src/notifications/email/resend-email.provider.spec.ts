import { Test } from '@nestjs/testing';
import { appConfig } from '../../config/app.config';
import { EmailModule } from './email.module';
import { EMAIL_PROVIDER, EmailDeliveryError, EmailSendOutcome } from './email-provider';
import { RESEND_CLIENT, ResendEmailProvider } from './resend-email.provider';

describe('ResendEmailProvider', () => {
  const config = { email: { provider: 'resend', resendApiKey: 're_test', fromAddress: 'providers@smartclinic.example', fromName: 'SmartClinic', sendTimeoutMs: 10000 } };
  const message = { to: 'provider@example.test', fromAddress: 'providers@smartclinic.example', fromName: 'SmartClinic', subject: 'Invitation', html: '<p>Invitation</p>', text: 'Invitation', idempotencyKey: 'provider-invitation:invitation-1:initial' };

  it('maps sender, recipient, content, and idempotency into the SDK call', async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: 'resend-message-id' }, error: null });
    const subject = new ResendEmailProvider(config as never, { emails: { send } } as never);
    await expect(subject.sendTransactionalEmail(message)).resolves.toEqual({ outcome: EmailSendOutcome.SENT });
    expect(send).toHaveBeenCalledWith({ from: 'SmartClinic <providers@smartclinic.example>', to: 'provider@example.test', subject: 'Invitation', html: '<p>Invitation</p>', text: 'Invitation' }, { idempotencyKey: 'provider-invitation:invitation-1:initial' });
  });

  it('uses the bare address when no sender name is configured', async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: 'message' }, error: null });
    const subject = new ResendEmailProvider(config as never, { emails: { send } } as never);
    await subject.sendTransactionalEmail({ ...message, fromName: undefined });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'providers@smartclinic.example' }), expect.anything());
  });

  it.each([
    ['provider error', { data: null, error: { statusCode: 400, message: 'sensitive provider detail' } }],
    ['rate limit', { data: null, error: { statusCode: 429, message: 'rate limited' } }],
  ])('sanitizes a %s response', async (_name, response) => {
    const subject = new ResendEmailProvider(config as never, { emails: { send: jest.fn().mockResolvedValue(response) } } as never);
    await expect(subject.sendTransactionalEmail(message)).rejects.toEqual(new EmailDeliveryError());
  });

  it('sanitizes network failures', async () => {
    const subject = new ResendEmailProvider(config as never, { emails: { send: jest.fn().mockRejectedValue(new Error('socket and request details')) } } as never);
    await expect(subject.sendTransactionalEmail(message)).rejects.toMatchObject({ message: 'Transactional email delivery failed' });
  });

  it('fails safely when the SDK call exceeds the configured timeout', async () => {
    const subject = new ResendEmailProvider({ email: { ...config.email, sendTimeoutMs: 5 } } as never, { emails: { send: jest.fn(() => new Promise(() => undefined)) } } as never);
    await expect(subject.sendTransactionalEmail(message)).rejects.toBeInstanceOf(EmailDeliveryError);
  });

  it('is selected only by explicit resend configuration', async () => {
    const module = await Test.createTestingModule({ imports: [EmailModule] }).overrideProvider(appConfig.KEY).useValue(config).overrideProvider(RESEND_CLIENT).useValue({ emails: { send: jest.fn() } }).compile();
    expect(module.get(EMAIL_PROVIDER)).toBeInstanceOf(ResendEmailProvider);
    await module.close();
  });
});
