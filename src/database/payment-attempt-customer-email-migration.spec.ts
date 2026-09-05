import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('PaymentAttempt customer email migration', () => {
  const source = readFileSync(join(__dirname, 'migrations/1794067200000-PaymentAttemptCustomerEmail.ts'), 'utf8');

  it('adds only the nullable payment-attempt customer email snapshot', () => {
    expect(source).toContain('ALTER TABLE "payment_attempts" ADD "customer_email" varchar(254)');
    expect(source).not.toContain('users');
    expect(source).not.toContain('patients');
    expect(source).not.toContain('CREATE TABLE');
  });
});
