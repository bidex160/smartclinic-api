import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app.config';
import { OpayPaymentProviderAdapter } from './adapters/opay-payment-provider.adapter';
import { PaystackPaymentProviderAdapter } from './adapters/paystack-payment-provider.adapter';
import { TestPaymentProviderAdapter } from './adapters/test-payment-provider.adapter';
import { PaymentProvider } from './enums/payment-provider.enum';
import { PaymentProviderAdapter } from './payment-provider.adapter';

@Injectable()
export class PaymentProviderRegistry {
  constructor(
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
    private readonly paystack: PaystackPaymentProviderAdapter,
    private readonly opay: OpayPaymentProviderAdapter,
    private readonly test: TestPaymentProviderAdapter,
  ) {}

  resolve(requested?: PaymentProvider | string): PaymentProviderAdapter {
    const code = requested ?? this.defaultCode();
    if (!code && !requested && this.config.payments.provider === 'test') return this.test;
    if (!code && !requested) throw new ServiceUnavailableException('No payment provider is configured');
    if (code === PaymentProvider.PAYSTACK) {
      if (!this.config.payments.paystack.secretKey) throw new ServiceUnavailableException('PAYSTACK payment provider is not configured');
      return this.paystack;
    }
    if (code === PaymentProvider.OPAY) {
      const settings = this.config.payments.opay;
      if (!settings.baseUrl || !settings.merchantId || !settings.publicKey || !settings.privateKey) throw new ServiceUnavailableException('OPAY payment provider is not configured');
      return this.opay;
    }
    if (code === 'TEST' && this.config.payments.provider === 'test') return this.test;
    throw new BadRequestException('Unsupported payment provider');
  }

  private defaultCode(): PaymentProvider | undefined {
    if (this.config.payments.provider === 'paystack') return PaymentProvider.PAYSTACK;
    if (this.config.payments.provider === 'opay') return PaymentProvider.OPAY;
    if (this.config.payments.provider === 'test') return undefined;
    return undefined;
  }
}
