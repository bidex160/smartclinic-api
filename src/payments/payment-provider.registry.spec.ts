import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { PaymentProvider } from './enums/payment-provider.enum';

describe('PaymentProviderRegistry', () => {
  const paystack = {} as any;
  const opay = {} as any;
  const test = {} as any;
  const make = (provider: string, overrides: any = {}) => new PaymentProviderRegistry({
    payments: {
      provider,
      paystack: { secretKey: 'paystack-secret' },
      opay: { baseUrl: 'https://opay.test', merchantId: 'merchant', publicKey: 'public', privateKey: 'private' },
      ...overrides,
    },
  } as any, paystack, opay, test);

  it('resolves an explicitly requested Paystack provider', () => {
    expect(make('opay').resolve(PaymentProvider.PAYSTACK)).toBe(paystack);
  });

  it('resolves an explicitly requested OPay provider', () => {
    expect(make('paystack').resolve(PaymentProvider.OPAY)).toBe(opay);
  });

  it('uses the configured default when the request omits a provider', () => {
    expect(make('opay').resolve()).toBe(opay);
    expect(make('paystack').resolve()).toBe(paystack);
  });

  it('rejects an explicitly selected provider that is not configured', () => {
    expect(() => make('paystack', { paystack: {} }).resolve(PaymentProvider.PAYSTACK))
      .toThrow(ServiceUnavailableException);
    expect(() => make('paystack', { opay: { baseUrl: 'x' } }).resolve(PaymentProvider.OPAY))
      .toThrow(ServiceUnavailableException);
  });

  it('rejects unsupported providers without falling back', () => {
    expect(() => make('paystack').resolve('STRIPE')).toThrow(BadRequestException);
  });

  it('rejects when no deployment default is configured', () => {
    expect(() => make('none').resolve()).toThrow(ServiceUnavailableException);
  });
});
