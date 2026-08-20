import { PaymentAttemptStatus } from "./enums/payment-attempt-status.enum";

export interface InitializePaymentInput {
  amount: string;
  currency: string;
  idempotencyKey: string;
  bookingReference: string;
  customerEmail: string;
  paymentReference: string;
}
export interface InitializePaymentResult {
  providerCode: string;
  providerReference: string;
  status:
    | PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION
    | PaymentAttemptStatus.PENDING_CONFIRMATION;
  checkoutUrl: string | null;
  accessCode: string | null;
}
export interface VerifyPaymentResult {
  succeeded: boolean;
  status:
    | PaymentAttemptStatus.PENDING_CONFIRMATION
    | PaymentAttemptStatus.SUCCEEDED
    | PaymentAttemptStatus.FAILED
    | PaymentAttemptStatus.CANCELLED;
  providerReference: string;
  amount: string;
  currency: string;
  occurredAt: Date;
}
export interface PaymentProviderWebhookEvent {
  type: string;
  reference: string | null;
}
export interface PaymentProviderAdapter {
  initializePayment(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult>;
  verifyPayment(providerReference: string): Promise<VerifyPaymentResult>;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
  parseWebhook(rawBody: Buffer): PaymentProviderWebhookEvent;
}
export const PAYMENT_PROVIDER_ADAPTER = Symbol("PAYMENT_PROVIDER_ADAPTER");
