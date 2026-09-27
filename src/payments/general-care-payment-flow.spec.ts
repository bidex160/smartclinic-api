import { ConflictException } from "@nestjs/common";
import { CareRequestFunding } from "../care-requests/entities/care-request-funding.entity";
import { CareRequest } from "../care-requests/entities/care-request.entity";
import { CareRequestFundingStatus } from "../care-requests/enums/care-request-funding-status.enum";
import { CareRequestStatus } from "../care-requests/enums/care-request-status.enum";
import { PaymentAttempt } from "./entities/payment-attempt.entity";
import { PaymentTransaction } from "./entities/payment-transaction.entity";
import { PaymentAttemptStatus } from "./enums/payment-attempt-status.enum";
import { PaymentFlowService } from "./payment-flow.service";

describe("PaymentFlowService General Care funding", () => {
  let care: any,
    funding: any,
    attempt: any,
    transaction: any,
    cares: any,
    fundings: any,
    attempts: any,
    transactions: any,
    manager: any,
    adapter: any,
    commissions: any,
    earnings: any,
    referralEarnings: any,
    partners: any,
    subject: PaymentFlowService;
  beforeEach(() => {
    care = {
      id: "care-1",
      reference: "SC-CARE-ABCDEF123456",
      userId: "user-1",
      user: { email: "patient@example.test" },
      status: CareRequestStatus.PROVIDER_ACCEPTED,
      assignedProviderId: "provider-1",
      assignedProviderCareServiceId: "offering-1",
      servicePriceMinor: "2000000",
      serviceCurrency: "NGN",
    };
    funding = null;
    attempt = null;
    transaction = null;
    cares = { findOne: jest.fn(async () => care) };
    fundings = {
      findOne: jest.fn(async () => funding),
      save: jest.fn(async (value) => {
        funding = { id: "funding-1", ...value };
        return funding;
      }),
    };
    attempts = {
      findOne: jest.fn(async () => attempt),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        attempt = { id: "attempt-1", ...value };
        return attempt;
      }),
    };
    transactions = {
      findOne: jest.fn(async () => transaction),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        transaction = { id: "transaction-1", ...value };
        return transaction;
      }),
    };
    manager = {
      getRepository: jest.fn((entity) =>
        entity === CareRequest
          ? cares
          : entity === CareRequestFunding
            ? fundings
            : entity === PaymentAttempt
              ? attempts
              : entity === PaymentTransaction
                ? transactions
                : {},
      ),
      transaction: jest.fn(async (work) => work(manager)),
    };
    const bookings: any = { manager };
    adapter = {
      initializePayment: jest.fn().mockResolvedValue({
        providerCode: "PAYSTACK",
        providerReference: "SC-PAY-GENERAL",
        status: PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION,
        checkoutUrl: "https://checkout.test/general",
        accessCode: "access",
      }),
      verifyPayment: jest.fn().mockResolvedValue({
        succeeded: true,
        status: PaymentAttemptStatus.SUCCEEDED,
        providerReference: "SC-PAY-GENERAL",
        amount: "20000.00",
        currency: "NGN",
        occurredAt: new Date(),
      }),
    };
    commissions = {
      requireForProvider: jest.fn().mockResolvedValue({
        rateBasisPoints: 1000,
        source: "PLATFORM_DEFAULT",
      }),
    };
    earnings = {
      createHeldGeneralCareEarning: jest
        .fn()
        .mockResolvedValue({ status: "HELD" }),
    };
    referralEarnings = { createHeldForGeneralCare: jest.fn() };
    partners = {
      preparePaymentAttribution: jest.fn(),
      allocateAttributedPayment: jest.fn(),
    };
    subject = new PaymentFlowService(
      bookings,
      attempts,
      adapter,
      undefined,
      undefined,
      undefined,
      earnings,
      commissions,
      undefined,
      undefined,
      undefined,
      referralEarnings,
      partners,
    );
  });
  it.each([
    CareRequestStatus.MATCHING,
    CareRequestStatus.AWAITING_PROVIDER_RESPONSE,
  ])("does not initialize from %s", async (status) => {
    care.status = status;
    await expect(
      subject.initializeCareRequestFunding(care.reference, care.userId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(adapter.initializePayment).not.toHaveBeenCalled();
  });
  it("fails commission readiness before contacting Paystack", async () => {
    commissions.requireForProvider.mockRejectedValue(
      new ConflictException("commission missing"),
    );
    await expect(
      subject.initializeCareRequestFunding(care.reference, care.userId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(adapter.initializePayment).not.toHaveBeenCalled();
  });
  it("uses only the CareRequest snapshot and permits an explicit zero-percent commission", async () => {
    commissions.requireForProvider.mockResolvedValue({
      rateBasisPoints: 0,
      source: "PROVIDER_OVERRIDE",
    });
    const result = await subject.initializeCareRequestFunding(
      care.reference,
      care.userId,
    );
    expect(adapter.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "20000.00", currency: "NGN" }),
    );
    expect(result).toMatchObject({
      amountMinor: 2000000,
      currency: "NGN",
      fundingStatus: CareRequestFundingStatus.PENDING,
    });
  });
  it("settles funding, transaction, provider earning, and referral attribution exactly once across repeated verification", async () => {
    await subject.initializeCareRequestFunding(care.reference, care.userId);
    await subject.verifyLatestCareRequestFunding(care.reference, care.userId);
    expect(funding.status).toBe(CareRequestFundingStatus.PAID);
    expect(transactions.save).toHaveBeenCalledTimes(1);
    expect(earnings.createHeldGeneralCareEarning).toHaveBeenCalledWith(
      manager,
      care,
      expect.objectContaining({ id: "transaction-1", amount: "20000.00" }),
    );
    expect(referralEarnings.createHeldForGeneralCare).toHaveBeenCalledWith(
      manager,
      care,
      expect.objectContaining({ id: "transaction-1" }),
      expect.objectContaining({ status: "HELD" }),
    );
    await subject.verifyLatestCareRequestFunding(care.reference, care.userId);
    expect(transactions.save).toHaveBeenCalledTimes(1);
    expect(earnings.createHeldGeneralCareEarning).toHaveBeenCalledTimes(1);
    expect(referralEarnings.createHeldForGeneralCare).toHaveBeenCalledTimes(1);
  });
  it("treats zero-price care as satisfied without Paystack, transaction, or earning", async () => {
    care.servicePriceMinor = "0";
    const result = await subject.initializeCareRequestFunding(
      care.reference,
      care.userId,
    );
    expect(result).toMatchObject({
      fundingRequired: false,
      paid: true,
      fundingStatus: CareRequestFundingStatus.SATISFIED_FREE,
    });
    expect(adapter.initializePayment).not.toHaveBeenCalled();
    expect(transactions.save).not.toHaveBeenCalled();
    expect(earnings.createHeldGeneralCareEarning).not.toHaveBeenCalled();
  });
  it("does not settle on authoritative amount mismatch", async () => {
    await subject.initializeCareRequestFunding(care.reference, care.userId);
    adapter.verifyPayment.mockResolvedValue({
      succeeded: true,
      status: PaymentAttemptStatus.SUCCEEDED,
      providerReference: "SC-PAY-GENERAL",
      amount: "10000.00",
      currency: "NGN",
      occurredAt: new Date(),
    });
    await subject.verifyLatestCareRequestFunding(care.reference, care.userId);
    expect(funding.status).toBe(CareRequestFundingStatus.PENDING);
    expect(earnings.createHeldGeneralCareEarning).not.toHaveBeenCalled();
  });
  it("charges an explicitly selected programme surcharge and allocates it once", async () => {
    partners.preparePaymentAttribution.mockResolvedValue({
      familyId: "family-1",
      programId: "program-1",
      surchargeAmountMinor: "100000",
      snapshot: {
        model: "EMBEDDED_SURCHARGE_V1",
        baseAmountMinor: "2000000",
        partnerAmountMinor: "60000",
        wellnessAmountMinor: "40000",
        currency: "NGN",
      },
    });
    adapter.verifyPayment.mockResolvedValue({
      succeeded: true,
      status: PaymentAttemptStatus.SUCCEEDED,
      providerReference: "SC-PAY-GENERAL",
      amount: "21000.00",
      currency: "NGN",
      occurredAt: new Date(),
    });

    const initialized = await subject.initializeCareRequestFunding(
      care.reference,
      care.userId,
      undefined,
      undefined,
      undefined,
      "family-1",
    );
    expect(initialized).toMatchObject({
      baseAmountMinor: 2000000,
      programmeSurchargeMinor: 100000,
      amountMinor: 2100000,
      partnerFamilyId: "family-1",
    });
    expect(adapter.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "21000.00" }),
    );

    await subject.verifyLatestCareRequestFunding(care.reference, care.userId);
    expect(partners.allocateAttributedPayment).toHaveBeenCalledTimes(1);
    await subject.verifyLatestCareRequestFunding(care.reference, care.userId);
    expect(partners.allocateAttributedPayment).toHaveBeenCalledTimes(1);
  });
});
