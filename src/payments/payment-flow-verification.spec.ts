import { BookingFunding } from '../bookings/entities/booking-funding.entity';
import { BookingStatusHistory } from '../bookings/entities/booking-status-history.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingFundingStatus } from '../bookings/enums/booking-funding-status.enum';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentAttemptStatus } from './enums/payment-attempt-status.enum';
import { PaymentFlowService } from './payment-flow.service';

describe('PaymentFlowService verified provider values', () => {
  const expected = { succeeded: true, status: PaymentAttemptStatus.SUCCEEDED as const, providerReference: 'SC-PAY-ref', amount: '12500.00', currency: 'NGN', occurredAt: new Date() };

  function setup() {
    const booking: any = { id: 'booking', bookingReference: 'SC-2026-ABCDEF123456', status: BookingStatus.AWAITING_FUNDING };
    const funding: any = { id: 'funding', bookingId: booking.id, booking, amount: '12500.00', currency: 'NGN', status: BookingFundingStatus.PENDING };
    const attempt: any = { id: 'attempt', bookingFundingId: funding.id, bookingFunding: funding, amount: '12500.00', currency: 'NGN', providerCode: 'PAYSTACK', providerReference: 'SC-PAY-ref', status: PaymentAttemptStatus.PENDING_CONFIRMATION, checkoutUrl: null };
    const attempts: any = { findOne: jest.fn().mockResolvedValue(attempt), save: jest.fn(async (value: any) => value) };
    const bookings: any = { findOne: jest.fn().mockResolvedValue(booking), save: jest.fn(async (value: any) => value) };
    const fundings: any = { findOne: jest.fn().mockResolvedValue(funding), save: jest.fn(async (value: any) => value) };
    const transactions: any = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((value: any) => value), save: jest.fn(async (value: any) => value) };
    const history: any = { create: jest.fn((value: any) => value), save: jest.fn(async (value: any) => value) };
    const manager: any = { getRepository: jest.fn((entity: any) => entity === PaymentAttempt ? attempts : entity === Booking ? bookings : entity === BookingFunding ? fundings : entity === PaymentTransaction ? transactions : history) };
    manager.transaction = jest.fn(async (work: any) => work(manager));
    bookings.manager = manager;
    return { subject: new PaymentFlowService(bookings, attempts, {} as never), attempt, funding, booking, attempts, fundings, bookings, transactions, history };
  }

  it.each([{ label: 'amount', change: { amount: '1.00' } }, { label: 'currency', change: { currency: 'USD' } }, { label: 'reference', change: { providerReference: 'SC-PAY-other' } }])('rejects $label mismatch', async ({ change }) => {
    const context = setup();
    const result = await context.subject.applyProviderVerification('PAYSTACK', 'SC-PAY-ref', { ...expected, ...change });
    expect(result.attemptStatus).toBe(PaymentAttemptStatus.FAILED);
    expect(context.transactions.save).not.toHaveBeenCalled();
    expect(context.booking.status).toBe(BookingStatus.AWAITING_FUNDING);
  });

  it.each([PaymentAttemptStatus.PENDING_CONFIRMATION, PaymentAttemptStatus.FAILED, PaymentAttemptStatus.CANCELLED])('does not settle a %s verification', async (status) => {
    const context = setup();
    await context.subject.applyProviderVerification('PAYSTACK', 'SC-PAY-ref', { ...expected, succeeded: false, status: status as PaymentAttemptStatus.PENDING_CONFIRMATION | PaymentAttemptStatus.FAILED | PaymentAttemptStatus.CANCELLED });
    expect(context.attempt.status).toBe(status);
    expect(context.transactions.save).not.toHaveBeenCalled();
    expect(context.booking.status).toBe(BookingStatus.AWAITING_FUNDING);
  });

  it('settles duplicate webhook/manual verified delivery once', async () => {
    const context = setup();
    await context.subject.applyProviderVerification('PAYSTACK', 'SC-PAY-ref', expected);
    await context.subject.applyProviderVerification('PAYSTACK', 'SC-PAY-ref', expected);
    expect(context.transactions.save).toHaveBeenCalledTimes(1);
    expect(context.history.save).toHaveBeenCalledTimes(1);
  });

  it('locks attempt, funding, and booking separately without joined relations', async () => {
    const context = setup(); await context.subject.applyProviderVerification('PAYSTACK', 'SC-PAY-ref', expected);
    expect(context.attempts.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'attempt' }, lock: { mode: 'pessimistic_write' } }));
    expect(context.fundings.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'funding' }, lock: { mode: 'pessimistic_write' } }));
    expect(context.bookings.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'booking' }, lock: { mode: 'pessimistic_write' } }));
    for (const repository of [context.attempts, context.fundings, context.bookings]) for (const [options] of repository.findOne.mock.calls) if (options.lock) expect(options).not.toHaveProperty('relations');
  });
});
