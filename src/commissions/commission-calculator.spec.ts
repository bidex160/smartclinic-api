import { BadRequestException } from '@nestjs/common';
import { calculateCommission } from './commission-calculator';

describe('calculateCommission', () => {
  it('deducts commission from gross without changing the patient-facing amount', () => {
    const result = calculateCommission(2_000_000n, 1000);
    expect(result.commissionAmountMinor).toBe(200_000n);
    expect(result.providerShareMinor).toBe(1_800_000n);
    expect(result.commissionAmountMinor + result.providerShareMinor).toBe(result.grossAmountMinor);
  });
  it('supports an explicit zero rate', () => expect(calculateCommission(2_000_000n, 0)).toMatchObject({ commissionAmountMinor: 0n, providerShareMinor: 2_000_000n }));
  it('rounds fractional minor-unit commission half up and preserves the invariant', () => {
    const result = calculateCommission(101n, 750);
    expect(result.commissionAmountMinor).toBe(8n);
    expect(result.providerShareMinor).toBe(93n);
    expect(result.commissionAmountMinor + result.providerShareMinor).toBe(101n);
  });
  it.each([-1, 10001, 7.5])('rejects invalid basis points %s', (rate) => expect(() => calculateCommission(100n, rate)).toThrow(BadRequestException));
});
