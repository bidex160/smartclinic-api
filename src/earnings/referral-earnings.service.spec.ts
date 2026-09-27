import { Referral } from "../rewards/entities/referral.entity";
import { ProviderEarning } from "./entities/provider-earning.entity";
import { ReferralEarning } from "./entities/referral-earning.entity";
import { ReferralEarningStatus } from "./enums/referral-earning-status.enum";
import { ReferralEarningsService } from "./referral-earnings.service";

describe("ReferralEarningsService", () => {
  const referral = {
    id: "referral-1",
    referralCodeId: "code-1",
    referrerUserId: "referrer-1",
    referralCode: { codeNormalized: "SC-ABC123" },
  };
  const care: any = {
    patientId: "patient-1",
    userId: "patient-user-1",
    reference: "SC-CARE-1",
  };
  const transaction: any = { id: "transaction-1" };
  let savedReferralEarning: any;
  let referralRepo: any;
  let referralEarningRepo: any;
  let providerRepo: any;
  let manager: any;
  let service: ReferralEarningsService;

  beforeEach(() => {
    savedReferralEarning = null;
    referralRepo = { findOne: jest.fn().mockResolvedValue(referral) };
    referralEarningRepo = {
      findOne: jest.fn(async () => savedReferralEarning),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        savedReferralEarning = { id: "earning-1", ...value };
        return savedReferralEarning;
      }),
    };
    providerRepo = { save: jest.fn(async (value) => value) };
    manager = {
      getRepository: jest.fn((entity) =>
        entity === Referral
          ? referralRepo
          : entity === ReferralEarning
            ? referralEarningRepo
            : entity === ProviderEarning
              ? providerRepo
              : {},
      ),
    };
    service = new ReferralEarningsService({} as any);
  });

  it("snapshots an exact 10% + 3% + 87% split in integer minor units", async () => {
    const providerEarning: any = {
      grossAmountMinor: "500000",
      commissionBps: 1000,
      commissionAmountMinor: "50000",
      providerShareMinor: "450000",
      currency: "NGN",
    };

    await expect(
      service.createHeldForGeneralCare(
        manager,
        care,
        transaction,
        providerEarning,
      ),
    ).resolves.toMatchObject({
      status: ReferralEarningStatus.HELD,
      grossAmountMinor: "500000",
      platformAmountMinor: "50000",
      referralAmountMinor: "15000",
      providerAmountMinor: "435000",
      referralCodeSnapshot: "SC-ABC123",
    });
    expect(providerEarning).toMatchObject({
      referralShareMinor: "15000",
      providerShareMinor: "435000",
    });
  });

  it("creates no monetary earning when the patient has no persisted referral", async () => {
    referralRepo.findOne.mockResolvedValue(null);
    await expect(
      service.createHeldForGeneralCare(manager, care, transaction, {
        grossAmountMinor: "500000",
      } as any),
    ).resolves.toBeNull();
    expect(referralEarningRepo.save).not.toHaveBeenCalled();
  });

  it("returns the existing payment obligation instead of duplicating it", async () => {
    savedReferralEarning = {
      id: "earning-existing",
      paymentTransactionId: transaction.id,
    };
    await expect(
      service.createHeldForGeneralCare(manager, care, transaction, {
        grossAmountMinor: "500000",
      } as any),
    ).resolves.toBe(savedReferralEarning);
    expect(referralEarningRepo.save).not.toHaveBeenCalled();
  });

  it("uses round-half-up and assigns the exact remainder to the provider", async () => {
    const providerEarning: any = {
      grossAmountMinor: "101",
      commissionBps: 1000,
      commissionAmountMinor: "10",
      providerShareMinor: "91",
      currency: "NGN",
    };
    const result = await service.createHeldForGeneralCare(
      manager,
      care,
      transaction,
      providerEarning,
    );
    expect(result).toMatchObject({
      platformAmountMinor: "10",
      referralAmountMinor: "3",
      providerAmountMinor: "88",
    });
    expect(10n + 3n + 88n).toBe(101n);
  });

  it("moves HELD to PAYABLE only after authoritative completion", async () => {
    savedReferralEarning = {
      status: ReferralEarningStatus.HELD,
      payableAt: null,
    };
    await expect(
      service.markGeneralCarePayable(manager, care.reference),
    ).resolves.toMatchObject({ status: ReferralEarningStatus.PAYABLE });
    expect(savedReferralEarning.payableAt).toBeInstanceOf(Date);
  });
});
