import { BadRequestException } from '@nestjs/common';

export interface CommissionCalculation {
  grossAmountMinor: bigint;
  rateBasisPoints: number;
  commissionAmountMinor: bigint;
  providerShareMinor: bigint;
}

export function calculateCommission(grossAmountMinor: bigint, rateBasisPoints: number): CommissionCalculation {
  if (grossAmountMinor < 0n) throw new BadRequestException('Gross amount must be non-negative');
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 10000) throw new BadRequestException('Commission basis points must be between 0 and 10000');
  const commissionAmountMinor = (grossAmountMinor * BigInt(rateBasisPoints) + 5000n) / 10000n;
  return { grossAmountMinor, rateBasisPoints, commissionAmountMinor, providerShareMinor: grossAmountMinor - commissionAmountMinor };
}
