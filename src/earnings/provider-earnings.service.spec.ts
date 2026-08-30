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
  it('copies the immutable pharmacy funding snapshot after commission configuration changes', async () => {
    commissions.requireForProvider.mockResolvedValue({ source: CommissionRateSource.PROVIDER_OVERRIDE, rateBasisPoints: 2000 });
    const result = await subject.createHeldPharmacyFulfillmentEarning(manager, {
      providerId: 'provider-1', fulfillmentReference: 'SC-ORF-SNAPSHOT',
      grossAmountMinor: '10000', currency: 'NGN', commissionBps: 1000,
      commissionSource: CommissionRateSource.PLATFORM_DEFAULT,
      commissionAmountMinor: '1000', providerShareMinor: '9000',
      paymentTransaction: { ...transaction, amount: '100.00' },
    });
    expect(result).toMatchObject({
      grossAmountMinor: '10000', commissionBps: 1000,
      commissionSource: CommissionRateSource.PLATFORM_DEFAULT,
      commissionAmountMinor: '1000', providerShareMinor: '9000',
      status: ProviderEarningStatus.HELD,
    });
    expect(commissions.requireForProvider).not.toHaveBeenCalled();
  });
  it('preserves a zero-percent pharmacy funding snapshot', async () => {
    await expect(subject.createHeldPharmacyFulfillmentEarning(manager, {
      providerId: 'provider-1', fulfillmentReference: 'SC-ORF-ZERO',
      grossAmountMinor: '10000', currency: 'NGN', commissionBps: 0,
      commissionSource: CommissionRateSource.PROVIDER_OVERRIDE,
      commissionAmountMinor: '0', providerShareMinor: '10000',
      paymentTransaction: { ...transaction, amount: '100.00' },
    })).resolves.toMatchObject({ commissionBps: 0, commissionAmountMinor: '0', providerShareMinor: '10000' });
  });
  it('keeps pharmacy earning creation and HELD to PAYABLE transition idempotent', async () => {
    const input = {
      providerId: 'provider-1', fulfillmentReference: 'SC-ORF-IDEMPOTENT',
      grossAmountMinor: '10000', currency: 'NGN', commissionBps: 1000,
      commissionSource: CommissionRateSource.PLATFORM_DEFAULT,
      commissionAmountMinor: '1000', providerShareMinor: '9000',
      paymentTransaction: { ...transaction, amount: '100.00' },
    };
    const first = await subject.createHeldPharmacyFulfillmentEarning(manager, input);
    await expect(subject.createHeldPharmacyFulfillmentEarning(manager, { ...input, commissionBps: 2000, commissionAmountMinor: '2000', providerShareMinor: '8000' })).resolves.toBe(first);
    await subject.markPharmacyFulfillmentPayable(manager, input.fulfillmentReference, 'actor-1');
    await subject.markPharmacyFulfillmentPayable(manager, input.fulfillmentReference, 'actor-1');
    expect(first).toMatchObject({ commissionBps: 1000, status: ProviderEarningStatus.PAYABLE });
    expect(history.save).toHaveBeenCalledTimes(2);
  });
  it('returns narrow not-found for cross-Provider detail', async () => { earnings.findOne.mockResolvedValue(null); await expect(subject.getOwn({ id: 'user-1' } as any, 'SC-EARN-other')).rejects.toBeInstanceOf(NotFoundException); });
  it('aggregates gross, commission, Provider share, statuses, and sources separately by currency', async () => {
    const qb = (rows: any[]) => { const value: any = { getRawMany: jest.fn().mockResolvedValue(rows) }; for (const method of ['select', 'addSelect', 'groupBy', 'addGroupBy', 'orderBy', 'addOrderBy', 'andWhere', 'innerJoin']) value[method] = jest.fn().mockReturnValue(value); return value; };
    const totals = qb([
      { currency: 'NGN', earningCount: '3', gross: '2000000', commission: '200000', providerShare: '1800000', held: '500000', payable: '300000', settled: '900000', voided: '100000' },
      { currency: 'USD', earningCount: '1', gross: '5000', commission: '0', providerShare: '5000', held: '5000', payable: '0', settled: '0', voided: '0' },
    ]);
    const statuses = qb([
      { currency: 'NGN', key: 'HELD', earningCount: '1', gross: '600000', commission: '100000', providerShare: '500000' },
      { currency: 'NGN', key: 'VOIDED', earningCount: '1', gross: '100000', commission: '0', providerShare: '100000' },
      { currency: 'USD', key: 'HELD', earningCount: '1', gross: '5000', commission: '0', providerShare: '5000' },
    ]);
    const sources = qb([
      { currency: 'NGN', key: 'GENERAL_CARE', earningCount: '2', gross: '2000000', commission: '200000', providerShare: '1800000' },
      { currency: 'USD', key: 'PHARMACY_FULFILLMENT', earningCount: '1', gross: '5000', commission: '0', providerShare: '5000' },
    ]);
    earnings.createQueryBuilder.mockReturnValueOnce(totals).mockReturnValueOnce(statuses).mockReturnValueOnce(sources);
    const result = await subject.balancesOwn({ id: 'user-1' } as any);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ currency: 'NGN', earningCount: 3, grossAmountMinor: 2000000, commissionAmountMinor: 200000, providerShareMinor: 1800000, heldAmountMinor: 500000, payableAmountMinor: 300000, settledAmountMinor: 900000, voidedAmountMinor: 100000 });
    expect(result[0].statusBreakdown).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'VOIDED', providerShareMinor: 100000 })]));
    expect(result[1]).toMatchObject({ currency: 'USD', commissionAmountMinor: 0, providerShareMinor: 5000 });
  });
  it('applies provider tenancy, filters, pagination, and stable newest-first ordering in SQL', async () => {
    const qb: any = { getManyAndCount: jest.fn().mockResolvedValue([[], 0]) };
    for (const method of ['innerJoinAndSelect', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) qb[method] = jest.fn().mockReturnValue(qb);
    earnings.createQueryBuilder.mockReturnValue(qb);
    await subject.listOwn({ id: 'user-1' } as any, { status: ProviderEarningStatus.HELD, currency: 'ngn', from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T23:59:59.000Z', page: 2, limit: 10 });
    expect(qb.andWhere).toHaveBeenCalledWith('earning.providerId = :providerId', { providerId: 'provider-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('earning.currency = :currency', { currency: 'NGN' });
    expect(qb.orderBy).toHaveBeenCalledWith('earning.createdAt', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('earning.id', 'DESC');
    expect(qb.skip).toHaveBeenCalledWith(10);
  });
});
