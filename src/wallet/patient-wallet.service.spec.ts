import { ConflictException } from '@nestjs/common';
import { PatientWalletService } from './patient-wallet.service';
import { PatientWallet } from './entities/patient-wallet.entity';
import { PatientWalletEntry, PatientWalletEntryDirection, PatientWalletEntryType } from './entities/patient-wallet-entry.entity';

describe('PatientWalletService hospital debit idempotency', () => {
  const wallet = { id: 'wallet-1', userId: 'user-1', currency: 'NGN', balanceMinor: '50000', version: 1 };
  function setup(prior:any = null) {
    const walletRepo:any = { findOne: jest.fn().mockResolvedValue(wallet), save: jest.fn(async (x:any)=>x), create: jest.fn((x:any)=>x) };
    const entryRepo:any = { findOne: jest.fn().mockResolvedValue(prior), save: jest.fn(async (x:any)=>x), create: jest.fn((x:any)=>x) };
    const manager:any = { getRepository: jest.fn((entity:any)=>entity===PatientWallet ? walletRepo : entryRepo) };
    const service = new PatientWalletService({} as any, {} as any);
    return { service, manager, walletRepo, entryRepo };
  }

  it('returns the original balance without a second debit for an exact replay', async () => {
    const prior = { direction: PatientWalletEntryDirection.DEBIT, type: PatientWalletEntryType.HOSPITAL_PAYMENT, amountMinor: '12500', balanceAfterMinor: '37500' };
    const { service, manager, walletRepo, entryRepo } = setup(prior);
    await expect(service.debitHospitalPaymentWithManager(manager, 'user-1', 12500, 'NGN', 'HSP-ONE', {})).resolves.toEqual({ debited: false, balanceMinor: 37500 });
    expect(walletRepo.save).not.toHaveBeenCalled();
    expect(entryRepo.save).not.toHaveBeenCalled();
  });

  it('fails closed when the same idempotency key is replayed with a different amount', async () => {
    const prior = { direction: PatientWalletEntryDirection.DEBIT, type: PatientWalletEntryType.HOSPITAL_PAYMENT, amountMinor: '12500', balanceAfterMinor: '37500' };
    const { service, manager, walletRepo } = setup(prior);
    await expect(service.debitHospitalPaymentWithManager(manager, 'user-1', 15000, 'NGN', 'HSP-ONE', {})).rejects.toBeInstanceOf(ConflictException);
    expect(walletRepo.save).not.toHaveBeenCalled();
  });

  it('debits once and records the post-payment balance for a new hospital settlement', async () => {
    const { service, manager, walletRepo, entryRepo } = setup(null);
    await expect(service.debitHospitalPaymentWithManager(manager, 'user-1', 12500, 'NGN', 'HSP-ONE', { items: ['one'] })).resolves.toEqual({ debited: true, balanceMinor: 37500 });
    expect(walletRepo.save).toHaveBeenCalledWith(expect.objectContaining({ balanceMinor: '37500', version: 2 }));
    expect(entryRepo.save).toHaveBeenCalledWith(expect.objectContaining({ direction: PatientWalletEntryDirection.DEBIT, type: PatientWalletEntryType.HOSPITAL_PAYMENT, amountMinor: '12500', balanceAfterMinor: '37500', idempotencyKey: 'HOSPITAL:HSP-ONE' }));
  });
});
