import { UnauthorizedException } from '@nestjs/common';
import { OpayWebhookController } from './opay-webhook.controller';

describe('OpayWebhookController', () => {
  const request = (raw: Buffer) => ({ rawBody: raw, headers: {} }) as any;

  it('rejects an unauthenticated callback before settlement', async () => {
    const adapter = { verifyWebhookSignature: jest.fn().mockReturnValue(false), parseWebhook: jest.fn(), verifyPayment: jest.fn() };
    const payments = { applyProviderVerification: jest.fn() };
    const controller = new OpayWebhookController(adapter as never, payments as never);
    await expect(controller.webhook(request(Buffer.from('{}')))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(adapter.parseWebhook).not.toHaveBeenCalled();
  });

  it('re-verifies a valid callback server-to-server and uses the shared settlement path', async () => {
    const adapter = { verifyWebhookSignature: jest.fn().mockReturnValue(true), parseWebhook: jest.fn().mockReturnValue({ type: 'transaction-status', reference: 'SC-PAY-opay' }), verifyPayment: jest.fn().mockResolvedValue({ succeeded: true, status: 'SUCCEEDED', providerReference: 'SC-PAY-opay', amount: '100.00', currency: 'NGN', occurredAt: new Date() }) };
    const payments = { applyProviderVerification: jest.fn().mockResolvedValue({}) };
    const controller = new OpayWebhookController(adapter as never, payments as never);
    const raw = Buffer.from(JSON.stringify({ payload: { reference: 'SC-PAY-opay' }, sha512: 'signature' }));
    await expect(controller.webhook(request(raw))).resolves.toEqual({ received: true });
    expect(adapter.verifyPayment).toHaveBeenCalledWith('SC-PAY-opay');
    expect(payments.applyProviderVerification).toHaveBeenCalledWith('OPAY', 'SC-PAY-opay', expect.objectContaining({ succeeded: true }));
  });
});
