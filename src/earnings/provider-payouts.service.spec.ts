import { ConflictException } from '@nestjs/common';
import { Provider } from '../providers/entities/provider.entity';
import { ProviderEarningStatusHistory } from './entities/provider-earning-status-history.entity';
import { ProviderEarning } from './entities/provider-earning.entity';
import { ProviderPayoutEarning } from './entities/provider-payout-earning.entity';
import { ProviderPayoutStatusHistory } from './entities/provider-payout-status-history.entity';
import { ProviderPayout } from './entities/provider-payout.entity';
import { ProviderEarningStatus } from './enums/provider-earning-status.enum';
import { ProviderPayoutSettlementMethod } from './enums/provider-payout-settlement-method.enum';
import { ProviderPayoutStatus } from './enums/provider-payout-status.enum';
import { ProviderPayoutsService } from './provider-payouts.service';

describe('ProviderPayoutsService', () => {
  let subject: ProviderPayoutsService; let payouts: any; let providers: any; let manager: any; let payoutRepo: any; let earningRepo: any; let membershipRepo: any; let payoutHistory: any; let earningHistory: any;
  const provider = { id: 'provider-1', providerReference: 'SCPR-ONE', displayName: 'Prime Clinic', deletedAt: null };
  const earning = (changes: any = {}) => ({ id: 'earning-1', reference: 'SC-EARN-ONE', providerId: provider.id, currency: 'NGN', providerShareMinor: '9000', status: ProviderEarningStatus.PAYABLE, sourceType: 'GENERAL_CARE', sourceReference: 'SC-CR-ONE', payableAt: new Date(), createdAt: new Date(), ...changes });
  const payout = (changes: any = {}) => ({ id: 'payout-1', reference: 'SC-PAYOUT-ONE', providerId: provider.id, provider, currency: 'NGN', totalAmountMinor: '9000', earningCount: 1, status: ProviderPayoutStatus.DRAFT, settlementMethod: ProviderPayoutSettlementMethod.MANUAL_BANK_TRANSFER, externalReference: null, note: null, createdAt: new Date(), updatedAt: new Date(), processingAt: null, completedAt: null, failedAt: null, cancelledAt: null, ...changes });
  beforeEach(() => {
    const earningQb: any = { where: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([earning()]) };
    earningRepo = { createQueryBuilder: jest.fn().mockReturnValue(earningQb), save: jest.fn(async value => value) };
    payoutRepo = { create: jest.fn(value => value), save: jest.fn(async value => Object.assign(value, { id: value.id ?? 'payout-1', reference: value.reference ?? 'SC-PAYOUT-ONE', provider, createdAt: value.createdAt ?? new Date(), updatedAt: value.updatedAt ?? new Date() })), findOne: jest.fn() };
    membershipRepo = { create: jest.fn(value => value), save: jest.fn(async value => value), find: jest.fn(), createQueryBuilder: jest.fn() };
    payoutHistory = { create: jest.fn(value => value), save: jest.fn(async value => value) }; earningHistory = { create: jest.fn(value => value), save: jest.fn(async value => value) };
    const providerRepo = { findOne: jest.fn().mockResolvedValue(provider) };
    manager = { getRepository: jest.fn(entity => entity === Provider ? providerRepo : entity === ProviderEarning ? earningRepo : entity === ProviderPayout ? payoutRepo : entity === ProviderPayoutEarning ? membershipRepo : entity === ProviderPayoutStatusHistory ? payoutHistory : earningHistory) };
    payouts = { manager: { transaction: jest.fn((callback: any) => callback(manager)), getRepository: jest.fn(entity => entity === ProviderEarning ? earningRepo : undefined) }, createQueryBuilder: jest.fn() };
    providers = { findOne: jest.fn().mockResolvedValue(provider) }; subject = new ProviderPayoutsService(payouts, providers);
    jest.spyOn(subject, 'adminDetail').mockImplementation(async reference => ({ reference }) as any);
  });
  it('locks PAYABLE earnings and calculates payout only from snapshotted Provider shares', async () => {
    await subject.create('admin-1', { providerReference: provider.providerReference, currency: 'ngn', earningReferences: ['SC-EARN-ONE'], settlementMethod: ProviderPayoutSettlementMethod.MANUAL_BANK_TRANSFER });
    expect(earningRepo.createQueryBuilder().setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(payoutRepo.create).toHaveBeenCalledWith(expect.objectContaining({ providerId: provider.id, currency: 'NGN', totalAmountMinor: '9000', earningCount: 1, status: ProviderPayoutStatus.DRAFT }));
    expect(membershipRepo.create).toHaveBeenCalledWith(expect.objectContaining({ providerEarningId: 'earning-1', providerShareMinor: '9000', releasedAt: null }));
  });
  it.each([ProviderEarningStatus.HELD, ProviderEarningStatus.SETTLED, ProviderEarningStatus.VOIDED])('rejects %s earnings', async status => {
    earningRepo.createQueryBuilder().getMany.mockResolvedValue([earning({ status })]);
    await expect(subject.create('admin-1', { providerReference: provider.providerReference, currency: 'NGN', earningReferences: ['SC-EARN-ONE'], settlementMethod: ProviderPayoutSettlementMethod.MANUAL_OTHER })).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects mixed Provider or currency membership', async () => {
    earningRepo.createQueryBuilder().getMany.mockResolvedValue([earning(), earning({ id: 'earning-2', reference: 'SC-EARN-TWO', providerId: 'provider-2' })]);
    await expect(subject.create('admin-1', { providerReference: provider.providerReference, currency: 'NGN', earningReferences: ['SC-EARN-ONE', 'SC-EARN-TWO'], settlementMethod: ProviderPayoutSettlementMethod.MANUAL_OTHER })).rejects.toBeInstanceOf(ConflictException);
    earningRepo.createQueryBuilder().getMany.mockResolvedValue([earning({ currency: 'USD' })]);
    await expect(subject.create('admin-1', { providerReference: provider.providerReference, currency: 'NGN', earningReferences: ['SC-EARN-ONE'], settlementMethod: ProviderPayoutSettlementMethod.MANUAL_OTHER })).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects duplicate earning references before creating a payout', async () => {
    await expect(subject.create('admin-1', { providerReference: provider.providerReference, currency: 'NGN', earningReferences: ['SC-EARN-ONE', 'sc-earn-one'], settlementMethod: ProviderPayoutSettlementMethod.MANUAL_OTHER })).rejects.toBeInstanceOf(ConflictException);
    expect(payoutRepo.save).not.toHaveBeenCalled();
  });
  it('completes transactionally, settles earnings, and appends both histories', async () => {
    const row = payout({ status: ProviderPayoutStatus.PROCESSING }); payoutRepo.findOne.mockResolvedValue(row); membershipRepo.find.mockResolvedValue([{ providerEarningId: 'earning-1', providerShareMinor: '9000' }]); earningRepo.createQueryBuilder().getMany.mockResolvedValue([earning()]);
    await subject.complete(row.reference, 'admin-1', { externalReference: 'BANK-123' });
    expect(row).toMatchObject({ status: ProviderPayoutStatus.COMPLETED, externalReference: 'BANK-123' });
    expect(earningRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ProviderEarningStatus.SETTLED }));
    expect(earningHistory.save).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: ProviderEarningStatus.PAYABLE, toStatus: ProviderEarningStatus.SETTLED }));
    expect(payoutHistory.save).toHaveBeenCalledWith(expect.objectContaining({ toStatus: ProviderPayoutStatus.COMPLETED }));
  });
  it('returns an already completed payout without settling or writing history again', async () => {
    payoutRepo.findOne.mockResolvedValue(payout({ status: ProviderPayoutStatus.COMPLETED }));
    await subject.complete('SC-PAYOUT-ONE', 'admin-1', { externalReference: 'BANK-123' });
    expect(earningRepo.save).not.toHaveBeenCalled(); expect(earningHistory.save).not.toHaveBeenCalled(); expect(payoutHistory.save).not.toHaveBeenCalled();
  });
  it.each([ProviderPayoutStatus.FAILED, ProviderPayoutStatus.CANCELLED])('releases reservation on %s without changing earnings', async target => {
    const row = payout({ status: target === ProviderPayoutStatus.FAILED ? ProviderPayoutStatus.PROCESSING : ProviderPayoutStatus.DRAFT }); payoutRepo.findOne.mockResolvedValue(row);
    const update: any = { set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue({}) }; membershipRepo.createQueryBuilder.mockReturnValue({ update: jest.fn().mockReturnValue(update) });
    if (target === ProviderPayoutStatus.FAILED) await subject.fail(row.reference, 'admin-1', 'Bank rejected'); else await subject.cancel(row.reference, 'admin-1', 'Cancelled');
    expect(update.where).toHaveBeenCalledWith('payout_id = :payoutId AND released_at IS NULL', { payoutId: row.id }); expect(earningRepo.save).not.toHaveBeenCalled();
  });
  it('fails closed when membership amount differs at completion', async () => {
    payoutRepo.findOne.mockResolvedValue(payout({ status: ProviderPayoutStatus.PROCESSING })); membershipRepo.find.mockResolvedValue([{ providerEarningId: 'earning-1', providerShareMinor: '8000' }]); earningRepo.createQueryBuilder().getMany.mockResolvedValue([earning()]);
    await expect(subject.complete('SC-PAYOUT-ONE', 'admin-1', { externalReference: 'BANK-123' })).rejects.toBeInstanceOf(ConflictException); expect(earningRepo.save).not.toHaveBeenCalled();
  });
});
