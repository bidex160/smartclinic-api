import { HospitalBillPaymentsService } from './hospital-bill-payments.service';
import { HospitalBillPaymentStatus } from './enums/hospital-bill-payment-status.enum';
import { HospitalNotificationStatus } from './enums/hospital-notification-status.enum';
import { PaymentAttemptStatus } from '../payments/enums/payment-attempt-status.enum';

describe('HospitalBillPaymentsService', () => {
  const payment = (overrides: any = {}) => ({ id: 'payment-1', reference: 'SC-HBP-1', userId: 'user-1', hospitalCode: 'AKTH', invoiceReference: 'INV-1', amount: '150.00', currency: 'NGN', status: HospitalBillPaymentStatus.PENDING, gatewayReference: 'SC-HBP-1', gatewayProvider: 'TEST', checkoutUrl: 'https://checkout.test/SC-HBP-1', accessCode: null, hospitalNotificationStatus: HospitalNotificationStatus.PENDING, hospitalNotificationReference: null, hospitalNotifiedAt: null, hospitalNotificationError: null, items: [{ itemReference: 'ITEM-1', description: 'Consultation', amount: '100.00' }, { itemReference: 'ITEM-2', description: 'Lab', amount: '50.00' }], ...overrides });

  function subject() {
    const rows: any[] = [];
    const items: any[] = [];
    const repo = (entity: any) => entity.name.includes('Item') ? {
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => Array.isArray(v) ? (items.push(...v), v) : (items.push(v), v)),
    } : {
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => (v.id ??= `payment-${rows.length + 1}`, rows.push(v), v)),
      update: jest.fn(async (where: any, values: any) => Object.assign(rows.find(r => r.id === where.id), values)),
      findOne: jest.fn(async (opts: any) => rows.find(r => r.id === opts.where.id || (r.reference === opts.where.reference && r.userId === opts.where.userId)) ?? null),
    };
    const manager = { getRepository: jest.fn((entity: any) => repo(entity)) };
    const payments: any = { manager: { transaction: jest.fn(async (fn: any) => fn(manager)) }, update: jest.fn(async (where: any, values: any) => Object.assign(rows.find(r => r.id === where.id), values)), findOne: jest.fn(async (opts: any) => rows.find(r => r.id === opts.where.id || (r.reference === opts.where.reference && r.userId === opts.where.userId)) ?? null) };
    const users = { findOne: jest.fn().mockResolvedValue({ id: 'user-1', email: 'patient@example.com' }) };
    const emr = { getInvoice: jest.fn().mockResolvedValue({ invoiceReference: 'INV-1', currency: 'NGN', items: [{ itemReference: 'ITEM-1', description: 'Consultation', amount: '100.00', payable: true }, { itemReference: 'ITEM-2', description: 'Lab', amount: '50.00', payable: true }] }), notifyPayment: jest.fn().mockResolvedValue({ accepted: true, reference: 'AKTH-1' }) };
    const provider = { initializePayment: jest.fn().mockResolvedValue({ providerCode: 'TEST', providerReference: 'SC-HBP-1', status: PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION, checkoutUrl: 'https://checkout.test/SC-HBP-1', accessCode: null }), verifyPayment: jest.fn().mockResolvedValue({ succeeded: true, status: PaymentAttemptStatus.SUCCEEDED, providerReference: 'SC-HBP-1', amount: '150.00', currency: 'NGN', occurredAt: new Date() }) };
    const registry = { resolve: jest.fn().mockReturnValue(provider) };
    const service = new HospitalBillPaymentsService(payments, {} as any, users as any, {} as any, {} as any, registry as any, {} as any, emr as any, { payments: { paystack: { patientCallbackUrl: undefined } } } as any);
    return { service, emr, provider, payments, rows };
  }

  it('calculates amount from the AKTH invoice and initializes the existing gateway', async () => {
    const { service, provider } = subject();
    const result = await service.initialize('user-1', { hospitalCode: 'AKTH', invoiceReference: 'INV-1', items: [{ itemReference: 'ITEM-1' }, { itemReference: 'ITEM-2' }] });
    expect(provider.initializePayment).toHaveBeenCalledWith(expect.objectContaining({ amount: '150.00', currency: 'NGN' }));
    expect(result).toMatchObject({ amount: '150.00', checkoutUrl: 'https://checkout.test/SC-HBP-1' });
  });

  it('rejects unsupported hospitals and items outside the authoritative invoice', async () => {
    const { service } = subject();
    await expect(service.initialize('user-1', { hospitalCode: 'OTHER', invoiceReference: 'INV-1', items: [{ itemReference: 'ITEM-1' }] })).rejects.toThrow('Unsupported hospital');
    await expect(service.initialize('user-1', { hospitalCode: 'AKTH', invoiceReference: 'INV-1', items: [{ itemReference: 'UNKNOWN' }] })).rejects.toThrow('Selected item does not belong to the invoice');
  });

  it('does not allow another patient to verify a payment reference', async () => {
    const { service } = subject();
    await service.initialize('user-1', { hospitalCode: 'AKTH', invoiceReference: 'INV-1', items: [{ itemReference: 'ITEM-1' }] });
    await expect(service.verify('user-2', 'SC-HBP-not-owned')).rejects.toThrow('Hospital bill payment was not found');
  });

  it('notifies AKTH only after verified payment and remains idempotent', async () => {
    const { service, emr, payments } = subject();
    const initialized = await service.initialize('user-1', { hospitalCode: 'AKTH', invoiceReference: 'INV-1', items: [{ itemReference: 'ITEM-1' }, { itemReference: 'ITEM-2' }] });
    const first = await service.verify('user-1', initialized.reference);
    const second = await service.verify('user-1', initialized.reference);
    expect(emr.notifyPayment).toHaveBeenCalledTimes(1);
    expect(first.status).toBe(HospitalBillPaymentStatus.PAID);
    expect(second.status).toBe(HospitalBillPaymentStatus.PAID);
    expect(payments.update).toHaveBeenCalled();
  });

  it('keeps payment received when hospital notification fails', async () => {
    const context = subject();
    context.emr.notifyPayment.mockRejectedValue(new Error('AKTH unavailable'));
    const initialized = await context.service.initialize('user-1', { hospitalCode: 'AKTH', invoiceReference: 'INV-1', items: [{ itemReference: 'ITEM-1' }, { itemReference: 'ITEM-2' }] });
    const result = await context.service.verify('user-1', initialized.reference);
    expect(result.status).toBe(HospitalBillPaymentStatus.PAYMENT_RECEIVED_HOSPITAL_PENDING);
    expect(result.hospitalNotificationStatus).toBe(HospitalNotificationStatus.FAILED);
  });
});
