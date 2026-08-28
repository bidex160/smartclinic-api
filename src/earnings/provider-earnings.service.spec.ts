import { ConflictException, NotFoundException } from '@nestjs/common';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { CommissionRateSource } from '../commissions/enums/commission-rate-source.enum';
import { PaymentTransaction } from '../payments/entities/payment-transaction.entity';
import { PaymentTransactionStatus } from '../payments/enums/payment-transaction-status.enum';
import { PaymentTransactionType } from '../payments/enums/payment-transaction-type.enum';
import { RewardBookingRedemption } from '../rewards/entities/reward-booking-redemption.entity';
import { ProviderEarning } from './entities/provider-earning.entity';
import { ProviderEarningStatusHistory } from './entities/provider-earning-status-history.entity';
import { ProviderEarningStatus } from './enums/provider-earning-status.enum';
import { ProviderEarningsService } from './provider-earnings.service';

describe('ProviderEarningsService', () => {
  let booking: any, transaction: any, earning: any, earnings: any, history: any, redemptions: any, bookings: any, providers: any, manager: any, commissions: any, subject: ProviderEarningsService;
  beforeEach(() => {
    booking = { id: 'booking-1', bookingReference: 'SC-2026-ABCDEF123456', commercialProviderId: 'provider-1', quotedAmount: '20000.00', currency: 'NGN', status: BookingStatus.PENDING_PROVIDER_MATCH };
    transaction = { id: 'transaction-1', transactionType: PaymentTransactionType.COLLECTION, status: PaymentTransactionStatus.SUCCEEDED, amount: '20000.00', currency: 'NGN' };
    earning = null;
    earnings = { findOne: jest.fn(async () => earning), create: jest.fn(value => value), save: jest.fn(async value => { earning = { id: 'earning-1', reference: 'SC-EARN-ABCDEF123456ABCDEF123456', createdAt: new Date(), updatedAt: new Date(), ...value }; return earning; }), createQueryBuilder: jest.fn() };
    history = { save: jest.fn(async value => value) }; redemptions = { findOne: jest.fn().mockResolvedValue(null) }; bookings = { findOne: jest.fn(async () => booking) }; providers = { findOne: jest.fn().mockResolvedValue({ id: 'provider-1', userId: 'user-1', deletedAt: null }) };
    manager = { getRepository: jest.fn(entity => entity === ProviderEarning ? earnings : entity === ProviderEarningStatusHistory ? history : entity === RewardBookingRedemption ? redemptions : entity === Booking ? bookings : providers) };
    commissions = { requireForProvider: jest.fn().mockResolvedValue({ configured: true, source: CommissionRateSource.PLATFORM_DEFAULT, rateBasisPoints: 1000 }) };
    subject = new ProviderEarningsService(earnings, providers, commissions);
  });
  it('snapshots gross, commission, Provider share, source, and HELD status', async () => {
    const result = await subject.createHeldHealthCheckEarning(manager, booking, transaction);
    expect(result).toMatchObject({ grossAmountMinor: '2000000', commissionBps: 1000, commissionSource: CommissionRateSource.PLATFORM_DEFAULT, commissionAmountMinor: '200000', providerShareMinor: '1800000', status: ProviderEarningStatus.HELD, paymentTransactionId: transaction.id });
    expect(commissions.requireForProvider).toHaveBeenCalledWith('provider-1', manager);
    expect(history.save).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: null, toStatus: ProviderEarningStatus.HELD }));
  });
  it('snapshots a Provider override and remains immutable when configuration later changes', async () => { commissions.requireForProvider.mockResolvedValueOnce({ source: CommissionRateSource.PROVIDER_OVERRIDE, rateBasisPoints: 500 }); const result = await subject.createHeldHealthCheckEarning(manager, booking, transaction); commissions.requireForProvider.mockResolvedValue({ source: CommissionRateSource.PROVIDER_OVERRIDE, rateBasisPoints: 800 }); expect((await subject.createHeldHealthCheckEarning(manager, booking, transaction)).commissionBps).toBe(500); expect(result.commissionAmountMinor).toBe('100000'); expect(earnings.save).toHaveBeenCalledTimes(1); });
  it('supports an explicit zero override', async () => { commissions.requireForProvider.mockResolvedValue({ source: CommissionRateSource.PROVIDER_OVERRIDE, rateBasisPoints: 0 }); await expect(subject.createHeldHealthCheckEarning(manager, booking, transaction)).resolves.toMatchObject({ commissionAmountMinor: '0', providerShareMinor: '2000000' }); });
  it('fails closed when commission is missing', async () => { commissions.requireForProvider.mockRejectedValue(new ConflictException('not configured')); await expect(subject.createHeldHealthCheckEarning(manager, booking, transaction)).rejects.toBeInstanceOf(ConflictException); expect(earnings.save).not.toHaveBeenCalled(); });
  it('rejects amount and currency mismatches', async () => { transaction.amount = '19999.99'; await expect(subject.createHeldHealthCheckEarning(manager, booking, transaction)).rejects.toBeInstanceOf(ConflictException); transaction.amount = '20000.00'; transaction.currency = 'USD'; await expect(subject.createHeldHealthCheckEarning(manager, booking, transaction)).rejects.toBeInstanceOf(ConflictException); });
  it('combines settled reward value with external collection while retaining gross snapshot', async () => { transaction.amount = '15000.00'; redemptions.findOne.mockResolvedValue({ amountMinor: '500000' }); await expect(subject.createHeldHealthCheckEarning(manager, booking, transaction)).resolves.toMatchObject({ grossAmountMinor: '2000000' }); });
  it('makes duplicate webhook/browser/reconciliation creation idempotent', async () => { const first = await subject.createHeldHealthCheckEarning(manager, booking, transaction); await expect(subject.createHeldHealthCheckEarning(manager, booking, transaction)).resolves.toBe(first); expect(earnings.save).toHaveBeenCalledTimes(1); });
  it('moves HELD to PAYABLE only after authoritative completion', async () => { await subject.createHeldHealthCheckEarning(manager, booking, transaction); booking.status = BookingStatus.COMPLETED; await expect(subject.markHealthCheckPayable(manager, booking.id, 'actor-1')).resolves.toMatchObject({ status: ProviderEarningStatus.PAYABLE, payableAt: expect.any(Date) }); expect(history.save).toHaveBeenLastCalledWith(expect.objectContaining({ fromStatus: ProviderEarningStatus.HELD, toStatus: ProviderEarningStatus.PAYABLE, reasonCode: 'HEALTH_CHECK_COMPLETED' })); });
  it('leaves an unfulfillable earning HELD', async () => { const result = await subject.createHeldHealthCheckEarning(manager, booking, transaction); booking.status = BookingStatus.UNFULFILLABLE; await expect(subject.markHealthCheckPayable(manager, booking.id, 'actor-1')).rejects.toBeInstanceOf(ConflictException); expect(result.status).toBe(ProviderEarningStatus.HELD); });
  it('returns narrow not-found for cross-Provider detail', async () => { earnings.findOne.mockResolvedValue(null); await expect(subject.getOwn({ id: 'user-1' } as any, 'SC-EARN-other')).rejects.toBeInstanceOf(NotFoundException); });
  it('aggregates separate currency balances from Provider share only', async () => { const qb: any = { select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), groupBy: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([{ currency: 'NGN', held: '1800000', payable: '3500000', settled: '10000000' }, { currency: 'USD', held: '5000', payable: '0', settled: '0' }]) }; earnings.createQueryBuilder.mockReturnValue(qb); await expect(subject.balancesOwn({ id: 'user-1' } as any)).resolves.toEqual([{ currency: 'NGN', heldAmountMinor: 1800000, payableAmountMinor: 3500000, settledAmountMinor: 10000000 }, { currency: 'USD', heldAmountMinor: 5000, payableAmountMinor: 0, settledAmountMinor: 0 }]); });
});
