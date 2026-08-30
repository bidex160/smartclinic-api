import { ClinicalOrderFulfillment } from '../clinical-orders/entities/clinical-order-fulfillment.entity';
import { PharmacyDispensing } from '../clinical-orders/entities/pharmacy-dispensing.entity';
import { PharmacyFulfillmentFunding } from '../clinical-orders/entities/pharmacy-fulfillment-funding.entity';
import { PharmacyQuote } from '../clinical-orders/entities/pharmacy-quote.entity';
import { PharmacyFundingStatus } from '../clinical-orders/enums/pharmacy-quote-status.enum';
import { CommissionRateSource } from '../commissions/enums/commission-rate-source.enum';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentAttemptStatus } from './enums/payment-attempt-status.enum';
import { PaymentFlowService } from './payment-flow.service';

describe('PaymentFlowService pharmacy funding settlement', () => {
  it('passes the immutable funding commission snapshot to earning creation exactly once', async () => {
    const attempt: any = {
      id: 'attempt-id', pharmacyFulfillmentFundingId: 'funding-id',
      providerReference: 'paystack-reference', amount: '100.00', currency: 'NGN',
      status: PaymentAttemptStatus.PENDING_CONFIRMATION,
    };
    const funding: any = {
      id: 'funding-id', quoteId: 'quote-id', fulfillmentId: 'fulfillment-id', providerId: 'provider-id',
      grossAmountMinor: '10000', currency: 'NGN', commissionBps: 1000,
      commissionSource: CommissionRateSource.PLATFORM_DEFAULT,
      commissionAmountMinor: '1000', providerShareMinor: '9000',
      status: PharmacyFundingStatus.PENDING, paidAt: null,
    };
    const quote: any = { id: 'quote-id', reference: 'SC-PHQ-SNAPSHOT' };
    const fulfillment: any = { id: 'fulfillment-id', reference: 'SC-ORF-SNAPSHOT' };
    let transaction: any = null;
    const attempts = { findOne: jest.fn(async () => attempt) };
    const fundings = { findOne: jest.fn(async () => funding) };
    const quotes = { findOneByOrFail: jest.fn(async () => quote) };
    const fulfillments = { findOneByOrFail: jest.fn(async () => fulfillment) };
    const transactions = {
      findOne: jest.fn(async () => transaction),
      save: jest.fn(async (value: any) => transaction = { id: 'transaction-id', ...value }),
    };
    const dispensings = { exists: jest.fn().mockResolvedValue(false), save: jest.fn(async (value: any) => value) };
    const manager: any = {
      transaction: jest.fn(async (work: any) => work(manager)),
      save: jest.fn(async (value: any) => value),
      getRepository: jest.fn((entity: any) => entity === PaymentAttempt ? attempts
        : entity === PharmacyFulfillmentFunding ? fundings
        : entity === PharmacyQuote ? quotes
        : entity === ClinicalOrderFulfillment ? fulfillments
        : entity === PaymentTransaction ? transactions
        : entity === PharmacyDispensing ? dispensings : {}),
    };
    const earnings = { createHeldPharmacyFulfillmentEarning: jest.fn().mockResolvedValue({}) };
    const subject: any = new PaymentFlowService({ manager } as any, attempts as any, {} as any, undefined, undefined, undefined, earnings as any);
    const verified: any = {
      succeeded: true, status: PaymentAttemptStatus.SUCCEEDED,
      providerReference: attempt.providerReference, amount: attempt.amount,
      currency: attempt.currency, occurredAt: new Date(),
    };

    await subject.applyPharmacyVerification(attempt.id, 'actor-id', verified);
    await subject.applyPharmacyVerification(attempt.id, 'actor-id', verified);

    expect(earnings.createHeldPharmacyFulfillmentEarning).toHaveBeenCalledTimes(1);
    expect(earnings.createHeldPharmacyFulfillmentEarning).toHaveBeenCalledWith(manager, expect.objectContaining({
      providerId: funding.providerId,
      fulfillmentReference: fulfillment.reference,
      grossAmountMinor: '10000', currency: 'NGN', commissionBps: 1000,
      commissionSource: CommissionRateSource.PLATFORM_DEFAULT,
      commissionAmountMinor: '1000', providerShareMinor: '9000',
    }));
    expect(transactions.save).toHaveBeenCalledTimes(1);
    expect(dispensings.save).toHaveBeenCalledTimes(1);
  });
  it('does not enter payment settlement or create an earning for SATISFIED_FREE funding', async () => {
    const earnings = { createHeldPharmacyFulfillmentEarning: jest.fn() };
    const subject: any = new PaymentFlowService({ manager: {} } as any, {} as any, {} as any, undefined, undefined, undefined, earnings as any);
    subject.getPharmacyFunding = jest.fn().mockResolvedValue({
      quoteReference: 'SC-PHQ-FREE', fundingRequired: false, amountMinor: 0,
      currency: 'NGN', fundingStatus: PharmacyFundingStatus.SATISFIED_FREE,
      paid: true, attemptStatus: null, checkoutUrl: null, accessCode: null,
    });
    subject.applyPharmacyVerification = jest.fn();

    await expect(subject.verifyLatestPharmacyFunding('SC-PHQ-FREE', 'user-id'))
      .resolves.toMatchObject({ fundingStatus: PharmacyFundingStatus.SATISFIED_FREE, amountMinor: 0 });
    expect(subject.applyPharmacyVerification).not.toHaveBeenCalled();
    expect(earnings.createHeldPharmacyFulfillmentEarning).not.toHaveBeenCalled();
  });
});
