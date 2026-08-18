import { PaymentAttemptStatus } from './enums/payment-attempt-status.enum';

export interface InitializePaymentInput { amount: string; currency: string; idempotencyKey: string; bookingReference: string; }
export interface InitializePaymentResult { providerCode: string; providerReference: string; status: PaymentAttemptStatus.AWAITING_CUSTOMER_ACTION | PaymentAttemptStatus.PENDING_CONFIRMATION; }
export interface VerifyPaymentResult { succeeded: boolean; providerReference: string; amount: string; currency: string; occurredAt: Date; }
export interface PaymentProviderAdapter { initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult>; verifyPayment(providerReference: string): Promise<VerifyPaymentResult>; }
export const PAYMENT_PROVIDER_ADAPTER = Symbol('PAYMENT_PROVIDER_ADAPTER');
