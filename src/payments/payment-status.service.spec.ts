import { BookingFunding } from '../bookings/entities/booking-funding.entity';
import { BookingFundingStatus } from '../bookings/enums/booking-funding-status.enum';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { CheckoutFundingOption } from '../bookings/enums/checkout-funding-option.enum';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentAttemptStatus } from './enums/payment-attempt-status.enum';
import { PaymentFlowService } from './payment-flow.service';

describe('PaymentFlowService public payment status', () => {
  const booking: any = { id: 'booking-id', bookingReference: 'SC-2026-ABCDEF123456', status: BookingStatus.AWAITING_FUNDING, quotedAmount: '12500.00', currency: 'NGN' };
  const funding: any = { id: 'funding-id', bookingId: booking.id, status: BookingFundingStatus.PENDING, checkoutOption: CheckoutFundingOption.PAY_LATER, amount: '12500.00', currency: 'NGN' };

  function setup(attempt: any = null, transaction: any = null, matching?: any) {
    const fundingRepository = { findOne: jest.fn().mockResolvedValue(funding) };
    const transactionRepository = { findOne: jest.fn().mockResolvedValue(transaction) };
    const lockedAttempts = { findOne: jest.fn().mockResolvedValue(attempt), save: jest.fn(async (value: any) => value) };
    const manager: any = { getRepository: jest.fn((entity: any) => entity === BookingFunding ? fundingRepository : entity === PaymentTransaction ? transactionRepository : entity === PaymentAttempt ? lockedAttempts : {}) };
    manager.transaction = jest.fn(async (work: any) => work(manager));
    const bookings: any = { findOne: jest.fn().mockResolvedValue(booking), manager };
    const attempts: any = { findOne: jest.fn().mockResolvedValue(attempt) };
    const provider: any = { verifyPayment: jest.fn() };
    const subject = new PaymentFlowService(bookings, attempts, provider, { payments: { verificationMinIntervalSeconds: 30 } } as never, matching);
    return { subject, provider, lockedAttempts };
  }

  it('returns a safe not-started state when there is no attempt', async () => {
    const { subject } = setup();
    await expect(subject.getPublicPaymentStatus(booking.bookingReference)).resolves.toEqual({ bookingReference: booking.bookingReference, bookingStatus: BookingStatus.AWAITING_FUNDING, fundingStatus: BookingFundingStatus.PENDING, checkoutOption: CheckoutFundingOption.PAY_LATER, paymentStatus: null, paymentAttemptReference: null, amount: '12500.00', currency: 'NGN', paidAt: null });
  });

  it('returns the latest pending attempt without internal IDs', async () => {
    const attempt = { id: 'internal-attempt', bookingFundingId: funding.id, status: PaymentAttemptStatus.PENDING_CONFIRMATION, providerReference: 'SC-PAY-safe', createdAt: new Date(), lastVerifiedAt: null };
    const result = await setup(attempt).subject.getPublicPaymentStatus(booking.bookingReference);
    expect(result).toMatchObject({ paymentStatus: PaymentAttemptStatus.PENDING_CONFIRMATION, paymentAttemptReference: 'SC-PAY-safe' });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('providerCode');
  });

  it('returns the successful transaction paidAt', async () => {
    const paidAt = new Date('2026-08-18T10:00:00Z');
    const attempt = { id: 'attempt', bookingFundingId: funding.id, status: PaymentAttemptStatus.SUCCEEDED, providerReference: 'SC-PAY-safe', createdAt: new Date() };
    const result = await setup(attempt, { occurredAt: paidAt }).subject.getPublicPaymentStatus(booking.bookingReference);
    expect(result.paymentStatus).toBe(PaymentAttemptStatus.SUCCEEDED);
    expect(result.paidAt).toEqual(paidAt);
  });

  it('keeps pending verification pending and never lets the client choose a reference', async () => {
    const attempt = { id: 'attempt', bookingFundingId: funding.id, status: PaymentAttemptStatus.PENDING_CONFIRMATION, providerReference: 'SC-PAY-server-selected', createdAt: new Date(), lastVerifiedAt: null };
    const context = setup(attempt);
    context.provider.verifyPayment.mockResolvedValue({ succeeded: false, status: PaymentAttemptStatus.PENDING_CONFIRMATION, providerReference: attempt.providerReference, amount: funding.amount, currency: funding.currency, occurredAt: new Date() });
    jest.spyOn(context.subject as any, 'applyVerification').mockResolvedValue({});
    await context.subject.verifyLatestBookingPayment(booking.bookingReference);
    expect(context.provider.verifyPayment).toHaveBeenCalledWith('SC-PAY-server-selected');
    expect((context.subject as any).applyVerification).toHaveBeenCalledWith('attempt', null, expect.objectContaining({ status: PaymentAttemptStatus.PENDING_CONFIRMATION }));
  });

  it('throttles repeated provider verification durably per attempt', async () => {
    const attempt = { id: 'attempt', bookingFundingId: funding.id, status: PaymentAttemptStatus.PENDING_CONFIRMATION, providerReference: 'SC-PAY-safe', createdAt: new Date(), lastVerifiedAt: new Date() };
    const context = setup(attempt);
    await expect(context.subject.verifyLatestBookingPayment(booking.bookingReference)).rejects.toMatchObject({ status: 429 });
    expect(context.provider.verifyPayment).not.toHaveBeenCalled();
  });

  it('uses deliberate verification to recover matching for an already-settled pending-match booking', async () => {
    const previousBookingStatus = booking.status;
    const previousFundingStatus = funding.status;
    booking.status = BookingStatus.PENDING_PROVIDER_MATCH;
    funding.status = BookingFundingStatus.SETTLED;
    const attempt = { id: 'attempt', bookingFundingId: funding.id, status: PaymentAttemptStatus.SUCCEEDED, providerReference: 'SC-PAY-safe', createdAt: new Date() };
    const matching = { startMatching: jest.fn().mockResolvedValue({}) };
    const context = setup(attempt, { occurredAt: new Date() }, matching);
    await context.subject.verifyLatestBookingPayment(booking.bookingReference, 'patient-user');
    expect(context.provider.verifyPayment).not.toHaveBeenCalled();
    expect(matching.startMatching).toHaveBeenCalledWith(booking.bookingReference, null);
    booking.status = previousBookingStatus;
    funding.status = previousFundingStatus;
  });
});
