import { CheckoutFundingOption } from '../bookings/enums/checkout-funding-option.enum';
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
    const bookings = { requireSelfBooking: jest.fn() };
    const payments = { initializeFunding: jest.fn().mockResolvedValue({}), initiatePatientPayment: jest.fn().mockResolvedValue({}) };
    await new MeHealthCheckPaymentsController(bookings as any, payments as any).initialize({ user }, { reference: 'SC-HC' }, { ...dto, option: CheckoutFundingOption.PAY_NOW });
    expect(payments.initiatePatientPayment).toHaveBeenCalledWith('SC-HC', CheckoutFundingOption.PAY_NOW, dto.paymentEmail);
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

  it('forwards paymentEmail through patient-provider connection initialization', async () => {
    const payments = { initializePatientProviderConnectionFunding: jest.fn() };
    await new MePatientProviderConnectionsController({} as any, payments as any).initialize({ user }, { reference: 'SC-PPC' }, dto);
    expect(payments.initializePatientProviderConnectionFunding).toHaveBeenCalledWith('SC-PPC', user.id, dto.paymentEmail);
  });

  it('forwards paymentEmail through FastTrack initialization', async () => {
    const payments = { initializeFastTrackPayment: jest.fn() };
    await new MeFastTrackController({} as any, payments as any).initialize({ user }, { reference: 'SC-FAST' }, dto);
    expect(payments.initializeFastTrackPayment).toHaveBeenCalledWith('SC-FAST', user.id, dto.paymentEmail);
  });
});
