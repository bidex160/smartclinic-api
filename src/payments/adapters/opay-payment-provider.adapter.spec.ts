import { createHmac } from 'node:crypto';
import { PaymentAttemptStatus } from '../enums/payment-attempt-status.enum';
import { OpayPaymentProviderAdapter } from './opay-payment-provider.adapter';

const config = () => ({ payments: { opay: {
  baseUrl: 'https://testapi.opaycheckout.com', merchantId: 'merchant', publicKey: 'public', privateKey: 'private',
  callbackUrl: 'https://api.test/api/v1/payments/opay/webhook', returnUrl: undefined, webhookEnabled: true,
} } } as any);

describe('OpayPaymentProviderAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('creates an Online Cashier order with the authoritative amount and safe checkout response', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ code: '00000', data: { reference: 'SC-PAY-1', orderNo: 'opay-order', cashierUrl: 'https://cashier.test/order' } }) } as Response);
    const result = await new OpayPaymentProviderAdapter(config()).initializePayment({ amount: '12500.00', currency: 'NGN', idempotencyKey: 'key', bookingReference: 'SC-BOOK-1', customerEmail: 'payer@example.test', paymentReference: 'SC-PAY-1', callbackUrl: 'https://app.test/return/SC-BOOK-1' });
    expect(result).toMatchObject({ providerCode: 'OPAY', providerReference: 'SC-PAY-1', status: PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION, checkoutUrl: 'https://cashier.test/order', accessCode: 'opay-order' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://testapi.opaycheckout.com/api/v1/international/cashier/create');
    expect((init?.headers as any).Authorization).toBe('Bearer public');
    expect(JSON.parse(init?.body as string)).toMatchObject({ reference: 'SC-PAY-1', country: 'NG', amount: { currency: 'NGN', total: 1250000 }, returnUrl: 'https://app.test/return/SC-BOOK-1' });
  });

  it('verifies server-side status and maps success/pending/failure conservatively', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ code: '00000', data: { reference: 'SC-PAY-1', status: 'SUCCESS', amount: { total: 1250000, currency: 'NGN' } } }) } as Response);
    await expect(new OpayPaymentProviderAdapter(config()).verifyPayment('SC-PAY-1')).resolves.toMatchObject({ succeeded: true, amount: '12500.00', currency: 'NGN', providerReference: 'SC-PAY-1' });
    expect((fetchMock.mock.calls[0][1]?.headers as any).Authorization).toMatch(/^Bearer [a-f0-9]{128}$/);
  });

  it('validates the official callback HMAC-SHA3-512 signature and parses its reference', () => {
    const payload = { amount: '1250000', currency: 'NGN', reference: 'SC-PAY-1', refunded: false, status: 'SUCCESS', timestamp: '2026-09-09T10:00:00Z', token: 'token', transactionId: 'tx' };
    const raw = Buffer.from(JSON.stringify({ type: 'transaction-status', payload }));
    const canonical = `{Amount:"1250000",Currency:"NGN",Reference:"SC-PAY-1",Refunded:f,Status:"SUCCESS",Timestamp:"2026-09-09T10:00:00Z",Token:"token",TransactionID:"tx"}`;
    const signature = createHmac('sha3-512', 'private').update(canonical).digest('hex');
    const adapter = new OpayPaymentProviderAdapter(config());
    expect(adapter.verifyWebhookSignature(raw, signature)).toBe(true);
    expect(adapter.verifyWebhookSignature(raw, '0'.repeat(128))).toBe(false);
    expect(adapter.parseWebhook(raw)).toEqual({ type: 'transaction-status', reference: 'SC-PAY-1' });
  });
});
