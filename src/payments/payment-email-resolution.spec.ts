import { BadRequestException } from '@nestjs/common';
import { PaymentFlowService } from './payment-flow.service';

describe('PaymentFlowService payment email resolution', () => {
  const service = new PaymentFlowService({} as never, {} as never, {} as never) as any;

  it('preserves account-email precedence for existing clients', () => {
    expect(service.resolvePaymentEmail(' Account@Example.COM ', 'other@example.test')).toBe('account@example.com');
  });

  it('uses and normalizes a supplied payment email only when account email is unusable', () => {
    expect(service.resolvePaymentEmail(null, ' Payer@Example.COM ')).toBe('payer@example.com');
  });

  it.each([undefined, '', '   ', 'not-an-email'])('fails safely when no usable payment email can be resolved from %p', (paymentEmail) => {
    expect(() => service.resolvePaymentEmail(null, paymentEmail)).toThrow(BadRequestException);
  });
});
