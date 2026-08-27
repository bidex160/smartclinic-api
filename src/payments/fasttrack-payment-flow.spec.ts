import { FastTrackRequestStatusHistory } from '../fasttrack/entities/fasttrack-request-status-history.entity';
import { FastTrackRequest } from '../fasttrack/entities/fasttrack-request.entity';
import { FastTrackStatus } from '../fasttrack/enums/fasttrack-status.enum';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentAttemptStatus } from './enums/payment-attempt-status.enum';
import { PaymentFlowService } from './payment-flow.service';

describe('PaymentFlowService FastTrack settlement', () => {
  const verified = { succeeded: true, status: PaymentAttemptStatus.SUCCEEDED as const, providerReference: 'SC-PAY-fasttrack', amount: '50.00', currency: 'NGN', occurredAt: new Date('2026-09-10T09:00:00Z') };
  let request: any; let attempt: any; let attempts: any; let transactions: any; let histories: any; let subject: PaymentFlowService;
  beforeEach(() => {
    request = { id: 'fasttrack-id', reference: 'SC-FT-ABCDEF0123456789', userId: 'user-id', feeMinor: '5000', currency: 'NGN', status: FastTrackStatus.PAYMENT_PENDING, paidAt: null, confirmedAt: null };
    attempt = { id: 'attempt-id', bookingFundingId: null, fastTrackRequestId: request.id, amount: '50.00', currency: 'NGN', status: PaymentAttemptStatus.PENDING_CONFIRMATION, providerReference: verified.providerReference };
    attempts = { findOne: jest.fn(async () => attempt), save: jest.fn(async (value) => value) };
    transactions = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    histories = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const requests = { findOne: jest.fn(async () => request), save: jest.fn(async (value) => value) };
    const manager: any = { getRepository: jest.fn((entity) => entity === PaymentAttempt ? attempts : entity === PaymentTransaction ? transactions : entity === FastTrackRequest ? requests : entity === FastTrackRequestStatusHistory ? histories : {}), transaction: jest.fn(async (work) => work(manager)) };
    const bookings: any = { manager };
    subject = new PaymentFlowService(bookings, attempts, { initializePayment: jest.fn(), verifyPayment: jest.fn(), verifyWebhookSignature: jest.fn(), parseWebhook: jest.fn() } as any);
  });

  it('records one provider transaction and atomically confirms a verified FastTrack payment', async () => {
    const result = await (subject as any).applyFastTrackVerification(attempt.id, 'user-id', verified);
    expect(attempt.status).toBe(PaymentAttemptStatus.SUCCEEDED);
    expect(request.status).toBe(FastTrackStatus.CONFIRMED);
    expect(request.paidAt).toEqual(verified.occurredAt);
    expect(transactions.save).toHaveBeenCalledTimes(1);
    expect(histories.save).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ fastTrackStatus: FastTrackStatus.CONFIRMED, paymentAttemptStatus: PaymentAttemptStatus.SUCCEEDED });
  });

  it('is idempotent after success and rejects amount mismatch without settlement', async () => {
    await (subject as any).applyFastTrackVerification(attempt.id, null, { ...verified, amount: '49.99' });
    expect(attempt.status).toBe(PaymentAttemptStatus.FAILED);
    expect(request.status).toBe(FastTrackStatus.PAYMENT_PENDING);
    expect(transactions.save).not.toHaveBeenCalled();
    attempt.status = PaymentAttemptStatus.SUCCEEDED; request.status = FastTrackStatus.CONFIRMED;
    await (subject as any).applyFastTrackVerification(attempt.id, null, verified);
    expect(transactions.save).not.toHaveBeenCalled();
  });
});
