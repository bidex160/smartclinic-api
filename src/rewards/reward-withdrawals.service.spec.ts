import { ConflictException } from "@nestjs/common";
import { RewardConversionRate } from "./entities/reward-conversion-rate.entity";
import { RewardPointsLedger } from "./entities/reward-points-ledger.entity";
import { RewardWithdrawalRequest } from "./entities/reward-withdrawal-request.entity";
import { RewardWithdrawalStatusHistory } from "./entities/reward-withdrawal-status-history.entity";
import { RewardWithdrawalStatus } from "./enums/reward-withdrawal-status.enum";
import { RewardWithdrawalsService } from "./reward-withdrawals.service";
import { User } from "../users/entities/user.entity";
import { RewardBookingRedemption } from "./entities/reward-booking-redemption.entity";

describe("RewardWithdrawalsService", () => {
  const userId = "10000000-0000-4000-8000-000000000001";
  const adminId = "10000000-0000-4000-8000-000000000002";
  let rows: any[];
  let ledger: any[];
  let histories: any[];
  let manager: any;
  let subject: RewardWithdrawalsService;

  beforeEach(() => {
    rows = []; ledger = []; histories = [];
    const withdrawalRepo: any = {
      manager: null,
      create: jest.fn((value) => ({ id: `w-${rows.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...value })),
      save: jest.fn(async (value) => { const index = rows.findIndex((row) => row.id === value.id); index < 0 ? rows.push(value) : rows.splice(index, 1, value); return value; }),
      exists: jest.fn(async ({ where }) => rows.some((row) => row.publicReference === where.publicReference)),
      findOne: jest.fn(async ({ where }) => rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null),
    };
    const historyRepo: any = { create: jest.fn((value) => ({ id: `h-${histories.length + 1}`, createdAt: new Date(), ...value })), save: jest.fn(async (value) => { histories.push(value); return value; }) };
    const ledgerRepo: any = { create: jest.fn((value) => ({ id: `l-${ledger.length + 1}`, ...value })), save: jest.fn(async (value) => { ledger.push(value); return value; }), exists: jest.fn(async ({ where }) => ledger.some((row) => row.eventKey === where.eventKey)) };
    const rateRepo: any = { findOne: jest.fn(async () => ({ id: "rate", points: 100, amount: "1000.00", currency: "NGN", isActive: true, effectiveFrom: new Date() })) };
    const userRepo: any = { findOne: jest.fn(async () => ({ id: userId })) };
    const redemptionRepo: any = { createQueryBuilder: jest.fn(() => ({ select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({ reserved: '0' }) })) };
    manager = { getRepository: jest.fn((entity) => entity === RewardWithdrawalRequest ? withdrawalRepo : entity === RewardWithdrawalStatusHistory ? historyRepo : entity === RewardPointsLedger ? ledgerRepo : entity === RewardConversionRate ? rateRepo : entity === RewardBookingRedemption ? redemptionRepo : entity === User ? userRepo : null) };
    manager.transaction = jest.fn(async (callback) => callback(manager));
    withdrawalRepo.manager = manager;
    subject = new RewardWithdrawalsService(withdrawalRepo, rateRepo, redemptionRepo);
    jest.spyOn(subject, "balance").mockResolvedValue({ availablePoints: 1000, reservedPoints: 0, withdrawalReservedPoints: 0, healthCheckReservedPoints: 0, lifetimeEarnedPoints: 1000, lifetimeRedeemedPoints: 0 });
  });

  it("creates a REQUESTED reservation using the configured integer-safe conversion snapshot", async () => {
    const result = await subject.create(userId, { points: 400, bankName: " Example Bank ", accountNumber: "0123456789", accountName: " Ada Okafor " });
    expect(result).toMatchObject({ points: 400, amount: "4000.00", currency: "NGN", status: RewardWithdrawalStatus.REQUESTED, maskedAccountNumber: "******6789" });
    expect(rows[0]).toMatchObject({ ratePoints: 100, rateAmountMinor: "100000", amountMinor: "400000" });
    expect(ledger).toHaveLength(0);
    expect(histories[0]).toMatchObject({ fromStatus: null, toStatus: RewardWithdrawalStatus.REQUESTED, actorUserId: userId });
  });

  it("rejects over-reservation", async () => {
    jest.spyOn(subject, "balance").mockResolvedValue({ availablePoints: 300, reservedPoints: 700, withdrawalReservedPoints: 700, healthCheckReservedPoints: 0, lifetimeEarnedPoints: 1000, lifetimeRedeemedPoints: 0 });
    await expect(subject.create(userId, { points: 400, bankName: "Bank", accountNumber: "0123456789", accountName: "Ada" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("moves REQUESTED to PROCESSING without a permanent debit", async () => {
    await subject.create(userId, { points: 400, bankName: "Bank", accountNumber: "0123456789", accountName: "Ada" });
    await subject.processing(rows[0].publicReference, adminId);
    expect(rows[0].status).toBe(RewardWithdrawalStatus.PROCESSING);
    expect(rows[0].processingAt).toBeInstanceOf(Date);
    expect(ledger).toHaveLength(0);
  });

  it("marks PAID once and appends exactly one permanent debit", async () => {
    await subject.create(userId, { points: 400, bankName: "Bank", accountNumber: "0123456789", accountName: "Ada" });
    const reference = rows[0].publicReference;
    await subject.paid(reference, adminId, { externalReference: "BANK-123" });
    await subject.paid(reference, adminId, { externalReference: "BANK-123" });
    expect(rows[0]).toMatchObject({ status: RewardWithdrawalStatus.PAID, externalReference: "BANK-123", processedByUserId: adminId });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ points: 400, eventType: "WITHDRAWAL_PAID", reasonCode: "MANUAL_CASH_WITHDRAWAL_PAID" });
  });

  it.each([RewardWithdrawalStatus.FAILED, RewardWithdrawalStatus.CANCELLED])("releases reservation without a debit on %s", async (terminal) => {
    await subject.create(userId, { points: 400, bankName: "Bank", accountNumber: "0123456789", accountName: "Ada" });
    const reference = rows[0].publicReference;
    if (terminal === RewardWithdrawalStatus.FAILED) await subject.failed(reference, adminId, "Transfer failed");
    else await subject.adminCancel(reference, adminId, "Cancelled safely");
    expect(rows[0].status).toBe(terminal);
    expect(ledger).toHaveLength(0);
  });
});
