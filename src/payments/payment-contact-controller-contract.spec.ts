import { CheckoutFundingOption } from '../bookings/enums/checkout-funding-option.enum';
import { PaymentClientPlatform } from './enums/payment-client-platform.enum';
import { MeHealthCheckPaymentsController } from '../bookings/me-health-check-payments.controller';
import { MeFastTrackController } from '../fasttrack/fasttrack.controller';
import { MePatientProviderConnectionsController } from '../patient-provider-connections/patient-provider-connections.controller';
import { MeCareRequestFundingController } from './me-care-request-funding.controller';
import { MeGuidedSelfCheckFundingController } from './me-guided-self-check-funding.controller';
import { MePharmacyFundingController } from './me-pharmacy-funding.controller';

describe('patient payment contact route contracts', () => {
  const user = { id: 'patient-user' } as any;
  const dto = { paymentEmail: 'payer@example.test' };

  it('forwards paymentEmail through Health Check initialization', async () => {
    const bookings = { requireOwnedBooking: jest.fn() };
    const payments = { initializeFunding: jest.fn().mockResolvedValue({}), initiatePatientPayment: jest.fn().mockResolvedValue({}) };
    await new MeHealthCheckPaymentsController(bookings as any, payments as any).initialize({ user }, { reference: 'SC-HC' }, { ...dto, option: CheckoutFundingOption.PAY_NOW });
    expect(payments.initiatePatientPayment).toHaveBeenCalledWith('SC-HC', CheckoutFundingOption.PAY_NOW, dto.paymentEmail);
  });

  it('forwards the explicit mobile return context without accepting a URL', async () => {
    const bookings = { requireOwnedBooking: jest.fn() };
    const payments = { initializeFunding: jest.fn().mockResolvedValue({}), initiatePatientPayment: jest.fn().mockResolvedValue({}) };
    await new MeHealthCheckPaymentsController(bookings as any, payments as any).initialize({ user }, { reference: 'SC-HC' }, { option: CheckoutFundingOption.PAY_NOW, clientPlatform: PaymentClientPlatform.MOBILE });
    expect(payments.initiatePatientPayment).toHaveBeenCalledWith('SC-HC', CheckoutFundingOption.PAY_NOW, undefined, undefined, 'MOBILE');
  });

  it.each([
    ['Guided Self-Check', (payments: any) => new MeGuidedSelfCheckFundingController(payments).initialize('SC-GSC', { user }, dto), 'initializeGuidedSelfCheckFunding', 'SC-GSC'],
    ['Pharmacy', (payments: any) => new MePharmacyFundingController(payments).initialize({ user }, { reference: 'SC-PHQ' }, dto), 'initializePharmacyFunding', 'SC-PHQ'],
    ['General Care', (payments: any) => new MeCareRequestFundingController(payments).initialize({ user }, { reference: 'SC-CARE' }, dto), 'initializeCareRequestFunding', 'SC-CARE'],
  ])('forwards paymentEmail through %s initialization', async (_name, invoke, method, reference) => {
    const payments = { [method]: jest.fn() };
    await invoke(payments);
    expect(payments[method]).toHaveBeenCalledWith(reference, user.id, dto.paymentEmail);
  });

  it('forwards mobile return context for Guided Self-Check funding', async () => {
    const payments = { initializeGuidedSelfCheckFunding: jest.fn() };
    await new MeGuidedSelfCheckFundingController(payments as any).initialize(
      'SC-GSC', { user }, { ...dto, clientPlatform: PaymentClientPlatform.MOBILE },
    );
    expect(payments.initializeGuidedSelfCheckFunding).toHaveBeenCalledWith(
      'SC-GSC', user.id, dto.paymentEmail, undefined, PaymentClientPlatform.MOBILE,
    );
  });

  it('forwards mobile return context for Pharmacy funding', async () => {
    const payments = { initializePharmacyFunding: jest.fn() };
    await new MePharmacyFundingController(payments as any).initialize({ user }, { reference: 'SC-PHQ' }, { ...dto, clientPlatform: PaymentClientPlatform.MOBILE, paymentProvider: 'OPAY' as any });
    expect(payments.initializePharmacyFunding).toHaveBeenCalledWith('SC-PHQ', user.id, dto.paymentEmail, 'OPAY', PaymentClientPlatform.MOBILE);
  });

  it('forwards mobile return context for General Care funding', async () => {
    const payments = { initializeCareRequestFunding: jest.fn() };
    await new MeCareRequestFundingController(payments as any).initialize(
      { user }, { reference: 'SC-CARE' },
      { ...dto, paymentProvider: 'PAYSTACK' as any, clientPlatform: PaymentClientPlatform.MOBILE },
    );
    expect(payments.initializeCareRequestFunding).toHaveBeenCalledWith(
      'SC-CARE', user.id, dto.paymentEmail, 'PAYSTACK', PaymentClientPlatform.MOBILE,
    );
  });

  it('forwards paymentEmail through patient-provider connection initialization', async () => {
    const payments = { initializePatientProviderConnectionFunding: jest.fn() };
    await new MePatientProviderConnectionsController({} as any, payments as any).initialize({ user }, { reference: 'SC-PPC' }, dto);
    expect(payments.initializePatientProviderConnectionFunding).toHaveBeenCalledWith('SC-PPC', user.id, dto.paymentEmail);
  });

  it('forwards mobile return context through patient-provider connection initialization', async () => {
    const payments = { initializePatientProviderConnectionFunding: jest.fn() };
    await new MePatientProviderConnectionsController({} as any, payments as any).initialize({ user }, { reference: 'SC-PPC' }, { ...dto, clientPlatform: PaymentClientPlatform.MOBILE, paymentProvider: 'OPAY' as any });
    expect(payments.initializePatientProviderConnectionFunding).toHaveBeenCalledWith('SC-PPC', user.id, dto.paymentEmail, 'OPAY', PaymentClientPlatform.MOBILE);
  });

  it('forwards paymentEmail through FastTrack initialization', async () => {
    const payments = { initializeFastTrackPayment: jest.fn() };
    await new MeFastTrackController({} as any, payments as any).initialize({ user }, { reference: 'SC-FAST' }, dto);
    expect(payments.initializeFastTrackPayment).toHaveBeenCalledWith('SC-FAST', user.id, dto.paymentEmail);
  });

  it('forwards mobile context through FastTrack initialization without accepting a URL', async () => {
    const payments = { initializeFastTrackPayment: jest.fn() };
    await new MeFastTrackController({} as any, payments as any).initialize(
      { user }, { reference: 'SC-FT-ABCDEF0123456789' },
      { ...dto, clientPlatform: PaymentClientPlatform.MOBILE },
    );
    expect(payments.initializeFastTrackPayment).toHaveBeenCalledWith(
      'SC-FT-ABCDEF0123456789', user.id, dto.paymentEmail, undefined, PaymentClientPlatform.MOBILE,
    );
  });
});
