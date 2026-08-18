import { ServiceUnavailableException } from '@nestjs/common';
import { InitializePaymentInput, InitializePaymentResult, PaymentProviderAdapter, VerifyPaymentResult } from '../payment-provider.adapter';
export class UnavailablePaymentProviderAdapter implements PaymentProviderAdapter {
  async initializePayment(_input: InitializePaymentInput): Promise<InitializePaymentResult> { throw new ServiceUnavailableException('No production payment provider is configured'); }
  async verifyPayment(_providerReference: string): Promise<VerifyPaymentResult> { throw new ServiceUnavailableException('No production payment provider is configured'); }
}
