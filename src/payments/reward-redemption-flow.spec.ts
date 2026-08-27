import { ConflictException } from "@nestjs/common";
import { BookingFunding } from "../bookings/entities/booking-funding.entity";
import { BookingStatusHistory } from "../bookings/entities/booking-status-history.entity";
import { Booking } from "../bookings/entities/booking.entity";
import { BookingFundingStatus } from "../bookings/enums/booking-funding-status.enum";
import { BookingStatus } from "../bookings/enums/booking-status.enum";
import { CheckoutFundingOption } from "../bookings/enums/checkout-funding-option.enum";
import { RewardBookingRedemption } from "../rewards/entities/reward-booking-redemption.entity";
import { RewardConversionRate } from "../rewards/entities/reward-conversion-rate.entity";
import { RewardPointsLedger } from "../rewards/entities/reward-points-ledger.entity";
import { RewardBookingRedemptionStatus } from "../rewards/enums/reward-booking-redemption-status.enum";
import { User } from "../users/entities/user.entity";
import { PaymentAttempt } from "./entities/payment-attempt.entity";
import { PaymentTransaction } from "./entities/payment-transaction.entity";
import { PaymentFlowService } from "./payment-flow.service";
import { TestPaymentProviderAdapter } from "./adapters/test-payment-provider.adapter";

describe("Health Check reward redemption funding", () => {
  const userId = "10000000-0000-4000-8000-000000000001";
  let booking: any; let funding: any; let redemptions: any[]; let ledgerRows: any[]; let attemptsRows: any[]; let manager: any; let matching: any; let rewards: any; let subject: PaymentFlowService;
  beforeEach(() => {
    booking = { id: "booking", bookingReference: "SC-2026-REWARD123456", bookerUserId: userId, quotedAmount: "10000.00", currency: "NGN", status: BookingStatus.AWAITING_FUNDING };
    funding = { id: "funding", bookingId: booking.id, booking, sourceType: "SELF", responsibleUserId: userId, responsibleUser: { email: "patient@example.test" }, payerContact: null, amount: "10000.00", currency: "NGN", status: BookingFundingStatus.PENDING, checkoutOption: CheckoutFundingOption.PAY_NOW };
    redemptions = []; ledgerRows = []; attemptsRows = [];
    const bookings: any = { manager: null, findOne: jest.fn(async () => booking), save: jest.fn(async (value) => value) };
    const fundings: any = { findOne: jest.fn(async () => funding), create: jest.fn((value) => ({ id: "funding", booking, ...value })), save: jest.fn(async (value) => { funding = value; return value; }) };
    const redemptionsRepo: any = { findOne: jest.fn(async ({ where }) => redemptions.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null), create: jest.fn((value) => ({ id: `redemption-${redemptions.length + 1}`, ...value })), save: jest.fn(async (value) => { const index = redemptions.findIndex((row) => row.id === value.id); index < 0 ? redemptions.push(value) : redemptions.splice(index, 1, value); return value; }) };
    const attempts: any = { findOne: jest.fn(async () => attemptsRows[0] ?? null), exists: jest.fn(async () => false), create: jest.fn((value) => ({ id: "attempt", ...value })), save: jest.fn(async (value) => { attemptsRows[0] = value; return value; }) };
    const ledger: any = { exists: jest.fn(async ({ where }) => ledgerRows.some((row) => row.eventKey === where.eventKey)), create: jest.fn((value) => value), save: jest.fn(async (value) => { ledgerRows.push(value); return value; }) };
    const history: any = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const transactions: any = { findOne: jest.fn(async () => null), create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    manager = { getRepository: jest.fn((entity) => entity === Booking ? bookings : entity === BookingFunding ? fundings : entity === RewardBookingRedemption ? redemptionsRepo : entity === RewardConversionRate ? { findOne: jest.fn(async () => ({ points: 100, amount: "1000.00", currency: "NGN", isActive: true })) } : entity === RewardPointsLedger ? ledger : entity === PaymentAttempt ? attempts : entity === PaymentTransaction ? transactions : entity === User ? { findOne: jest.fn(async () => ({ id: userId })) } : history) };
    manager.transaction = jest.fn(async (callback) => callback(manager)); bookings.manager = manager;
    rewards = { balance: jest.fn(async () => ({ availablePoints: 2000, reservedPoints: 0, withdrawalReservedPoints: 0, healthCheckReservedPoints: 0, lifetimeEarnedPoints: 2000, lifetimeRedeemedPoints: 0 })) };
    matching = { startMatching: jest.fn().mockResolvedValue({}) };
    subject = new PaymentFlowService(bookings, attempts, new TestPaymentProviderAdapter(), undefined, matching, rewards);
  });

  it("settles a points-only booking once and starts matching after commit without Paystack", async () => {
    const result = await subject.applyRewardPoints(booking.bookingReference, userId, 1000);
    expect(result).toMatchObject({ pointsReserved: 1000, pointsAmount: "10000.00", remainingExternalAmount: "0.00", redemptionStatus: RewardBookingRedemptionStatus.SETTLED, fundingStatus: BookingFundingStatus.SETTLED, requiresExternalPayment: false });
    expect(booking.status).toBe(BookingStatus.PENDING_PROVIDER_MATCH);
    expect(ledgerRows).toHaveLength(1);
    expect(attemptsRows).toHaveLength(0);
    expect(matching.startMatching).toHaveBeenCalledWith(booking.bookingReference, null);
  });

  it("reserves split points and initializes Paystack for only the remaining amount", async () => {
    const applied = await subject.applyRewardPoints(booking.bookingReference, userId, 400);
    expect(applied).toMatchObject({ pointsAmount: "4000.00", remainingExternalAmount: "6000.00", redemptionStatus: RewardBookingRedemptionStatus.RESERVED });
    expect(funding.amount).toBe("6000.00"); expect(ledgerRows).toHaveLength(0);
    const initialized = await subject.initiatePatientPayment(booking.bookingReference, CheckoutFundingOption.PAY_NOW);
    expect(initialized.amount).toBe("6000.00");
    expect(attemptsRows[0].amount).toBe("6000.00");
  });

  it("authoritatively settles split Paystack plus points exactly once", async () => {
    await subject.applyRewardPoints(booking.bookingReference, userId, 400);
    await subject.initiatePatientPayment(booking.bookingReference, CheckoutFundingOption.PAY_NOW);
    attemptsRows[0].bookingFunding = funding;
    await subject.confirmPayment(attemptsRows[0].id, userId);
    await subject.confirmPayment(attemptsRows[0].id, userId);
    expect(funding.status).toBe(BookingFundingStatus.SETTLED);
    expect(redemptions[0].status).toBe(RewardBookingRedemptionStatus.SETTLED);
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toMatchObject({ direction: "DEBIT", points: 400, reasonCode: "HEALTH_CHECK_REDEMPTION" });
    expect(booking.status).toBe(BookingStatus.PENDING_PROVIDER_MATCH);
  });

  it("rejects insufficient points and over-redemption without mutation", async () => {
    rewards.balance.mockResolvedValueOnce({ availablePoints: 300 });
    await expect(subject.applyRewardPoints(booking.bookingReference, userId, 400)).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.applyRewardPoints(booking.bookingReference, userId, 1100)).rejects.toBeInstanceOf(ConflictException);
    expect(redemptions).toHaveLength(0); expect(ledgerRows).toHaveLength(0);
  });

  it("releases a split reservation when no external attempt is active", async () => {
    await subject.applyRewardPoints(booking.bookingReference, userId, 400);
    await expect(subject.releaseRewardPoints(booking.bookingReference, userId)).resolves.toMatchObject({ redemptionStatus: RewardBookingRedemptionStatus.RELEASED, releasedPoints: 400 });
    expect(funding.amount).toBe("10000.00"); expect(ledgerRows).toHaveLength(0);
  });
});
