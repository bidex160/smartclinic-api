import { ClinicalOrderFulfillment } from '../clinical-orders/entities/clinical-order-fulfillment.entity';
import { CommissionRateSource } from '../commissions/enums/commission-rate-source.enum';
import { ProviderEarning } from './entities/provider-earning.entity';
import { ProviderEarningStatusHistory } from './entities/provider-earning-status-history.entity';
import { ProviderEarningSourceType } from './enums/provider-earning-source-type.enum';
import { ProviderEarningStatus } from './enums/provider-earning-status.enum';
import { ProviderEarningsService } from './provider-earnings.service';

describe('Provider referral fee (embedded in the price)', () => {
  let rows: any[];
  let fulfillment: any;
  let history: any[];
  let manager: any;
  let commissions: any;
  let enumValues: string[];

  const service = (bps?: number) =>
    new ProviderEarningsService({} as any, {} as any, commissions, bps === undefined ? undefined : ({ referrals: { providerReferralBps: bps } } as any));

  const receiverEarning = (overrides: Record<string, unknown> = {}) => ({
    id: 'e-1',
    providerId: 'lab-b',
    sourceType: ProviderEarningSourceType.DIAGNOSTIC_FULFILLMENT,
    sourceReference: 'SC-ORF-2',
    currency: 'NGN',
    grossAmountMinor: '1000000', // ₦10,000
    commissionBps: 1000,
    commissionSource: CommissionRateSource.PLATFORM_DEFAULT,
    commissionAmountMinor: '100000',
    referralShareMinor: '0',
    providerShareMinor: '900000',
    status: ProviderEarningStatus.HELD,
    ...overrides,
  });

  beforeEach(() => {
    rows = [];
    history = [];
    enumValues = ['DIAGNOSTIC_FULFILLMENT', 'PHARMACY_FULFILLMENT', 'PROVIDER_REFERRAL'];
    fulfillment = { reference: 'SC-ORF-2', referredFromFulfillmentId: 'f-1', recommendedByProviderId: 'lab-a' };
    const earnings = {
      findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.sourceType === where.sourceType && r.sourceReference === where.sourceReference) ?? null),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => {
        const row = value.id ? value : { id: `e-${rows.length + 2}`, ...value };
        const index = rows.findIndex((r) => r.id === row.id);
        if (index >= 0) rows[index] = row;
        else rows.push(row);
        return row;
      }),
    };
    manager = {
      query: jest.fn(async (_sql: string, [type]: string[]) => [{ supported: enumValues.includes(type) }]),
      getRepository: (entity: unknown) =>
        entity === ProviderEarning ? earnings
        : entity === ClinicalOrderFulfillment ? { findOne: jest.fn(async () => fulfillment) }
        : entity === ProviderEarningStatusHistory ? { save: jest.fn(async (v: any) => history.push(v)) }
        : null,
    };
    commissions = { resolveForProvider: jest.fn(async () => ({ configured: true, rateBasisPoints: 1000, source: CommissionRateSource.PLATFORM_DEFAULT })) };
  });

  it('moves 3% from the receiving provider’s share to the referrer, leaving the price and commission alone', async () => {
    const earning = receiverEarning();
    rows.push(earning);
    const referral: any = await service().applyProviderReferral(manager, earning as any);

    expect(earning).toMatchObject({ grossAmountMinor: '1000000', commissionAmountMinor: '100000', referralShareMinor: '30000', providerShareMinor: '870000' });
    expect(BigInt(earning.commissionAmountMinor) + BigInt(earning.referralShareMinor) + BigInt(earning.providerShareMinor)).toBe(1000000n);
    expect(referral).toMatchObject({
      providerId: 'lab-a',
      sourceType: 'PROVIDER_REFERRAL',
      sourceReference: 'SC-ORF-2',
      grossAmountMinor: '30000',
      commissionAmountMinor: '0',
      providerShareMinor: '30000',
      status: 'HELD',
      paymentTransactionId: null,
    });
  });

  it('uses the configured rate and does nothing twice', async () => {
    const earning = receiverEarning();
    rows.push(earning);
    const svc = service(500);
    await svc.applyProviderReferral(manager, earning as any);
    await svc.applyProviderReferral(manager, earning as any);
    expect(earning.referralShareMinor).toBe('50000');
    expect(rows.filter((r) => r.sourceType === 'PROVIDER_REFERRAL')).toHaveLength(1);
  });

  it('ignores jobs that were not referred, or referred by the same provider', async () => {
    fulfillment = { reference: 'SC-ORF-2', referredFromFulfillmentId: null, recommendedByProviderId: 'doctor' };
    await expect(service().applyProviderReferral(manager, receiverEarning() as any)).resolves.toBeNull();
    fulfillment = { reference: 'SC-ORF-2', referredFromFulfillmentId: 'f-1', recommendedByProviderId: 'lab-b' };
    await expect(service().applyProviderReferral(manager, receiverEarning() as any)).resolves.toBeNull();
  });

  it('skips a fee larger than the provider’s share instead of failing the payment', async () => {
    const earning = receiverEarning({ commissionAmountMinor: '990000', providerShareMinor: '10000' });
    await expect(service().applyProviderReferral(manager, earning as any)).resolves.toBeNull();
    expect(earning.providerShareMinor).toBe('10000');
  });

  it('releases the referrer’s fee when the job is completed', async () => {
    rows.push({ id: 'r-1', sourceType: 'PROVIDER_REFERRAL', sourceReference: 'SC-ORF-2', status: ProviderEarningStatus.HELD, payableAt: null });
    await service().releaseProviderReferral(manager, 'SC-ORF-2', 'scientist');
    expect(rows[0]).toMatchObject({ status: 'PAYABLE' });
    expect(history[0]).toMatchObject({ reasonCode: 'PROVIDER_REFERRAL_JOB_COMPLETED' });
  });

  it('records card-paid lab earnings with the referral fee, and skips when commission isn’t configured', async () => {
    const tx: any = { id: 'tx-1' };
    const earning: any = await service().createHeldDiagnosticFulfillmentEarning(manager, { providerId: 'lab-b', fulfillmentReference: 'SC-ORF-2', grossAmountMinor: '1000000', currency: 'NGN', paymentTransaction: tx });
    expect(earning).toMatchObject({ sourceType: 'DIAGNOSTIC_FULFILLMENT', paymentTransactionId: 'tx-1', commissionAmountMinor: '100000', referralShareMinor: '30000', providerShareMinor: '870000' });
    commissions.resolveForProvider.mockResolvedValue({ configured: false });
    await expect(service().createHeldDiagnosticFulfillmentEarning(manager, { providerId: 'lab-c', fulfillmentReference: 'SC-ORF-9', grossAmountMinor: '5000', currency: 'NGN', paymentTransaction: { id: 'tx-2' } as any })).resolves.toBeNull();
  });

  it('never touches the new earning types before the database has them', async () => {
    enumValues = ['PHARMACY_FULFILLMENT'];
    const earning = receiverEarning();
    await expect(service().applyProviderReferral(manager, earning as any)).resolves.toBeNull();
    await expect(service().releaseProviderReferral(manager, 'SC-ORF-2', null)).resolves.toBeNull();
    await expect(service().createHeldDiagnosticFulfillmentEarning(manager, { providerId: 'lab-b', fulfillmentReference: 'SC-ORF-2', grossAmountMinor: '1000', currency: 'NGN', paymentTransaction: { id: 'tx' } as any })).resolves.toBeNull();
    expect(earning.referralShareMinor).toBe('0');
  });
});
