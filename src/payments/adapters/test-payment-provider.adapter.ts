import { Injectable } from '@nestjs/common';
import { PaymentAttemptStatus } from '../enums/payment-attempt-status.enum';
import { InitializePaymentInput, InitializePaymentResult, PaymentProviderAdapter, VerifyPaymentResult } from '../payment-provider.adapter';

@Injectable()
export class TestPaymentProviderAdapter implements PaymentProviderAdapter {
  private readonly payments = new Map<string, { amount: string; currency: string; failed: boolean }>();
  async initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult> { const providerReference = input.paymentReference; this.payments.set(providerReference, { amount: input.amount, currency: input.currency, failed: input.idempotencyKey.toUpperCase().startsWith('FAIL') }); return { providerCode: 'TEST', providerReference, status: PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION, checkoutUrl: `https://checkout.test/${providerReference}` }; }
  async verifyPayment(providerReference: string): Promise<VerifyPaymentResult> { const payment = this.payments.get(providerReference); if (!payment) return { succeeded: false, providerReference, amount: '0.00', currency: 'NGN', occurredAt: new Date() }; return { succeeded: !payment.failed, providerReference, amount: payment.amount, currency: payment.currency, occurredAt: new Date() }; }
  verifyWebhookSignature(): boolean { return false; }
  parseWebhook(): { type: string; reference: string | null } { return { type: 'unsupported', reference: null }; }
}
