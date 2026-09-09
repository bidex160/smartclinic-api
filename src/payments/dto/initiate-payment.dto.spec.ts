import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaymentContactDto, PublicCheckoutSelectionDto } from './initiate-payment.dto';
import { PaymentProvider } from '../enums/payment-provider.enum';

describe('payment contact DTOs', () => {
  it.each([PaymentContactDto, PublicCheckoutSelectionDto])('accepts and normalizes optional paymentEmail for %p', async (Dto) => {
    const value = plainToInstance(Dto, { paymentEmail: '  Payer@Example.COM  ' });
    expect(await validate(value)).toEqual([]);
    expect(value.paymentEmail).toBe('payer@example.com');
  });

  it('treats blank paymentEmail as absent', async () => {
    const value = plainToInstance(PaymentContactDto, { paymentEmail: '   ' });
    expect(await validate(value)).toEqual([]);
    expect(value.paymentEmail).toBeUndefined();
  });

  it.each(['not-an-email', 'payer@', `${'a'.repeat(250)}@x.test`])('rejects malformed/oversized payment email %s', async (paymentEmail) => {
    expect(await validate(plainToInstance(PaymentContactDto, { paymentEmail }))).not.toEqual([]);
  });

  it('validates the optional request-level provider', async () => {
    expect(await validate(plainToInstance(PaymentContactDto, { paymentProvider: PaymentProvider.OPAY }))).toEqual([]);
    expect(await validate(plainToInstance(PaymentContactDto, { paymentProvider: 'STRIPE' }))).not.toEqual([]);
  });
});
