import { randomBytes } from 'node:crypto';

export function generateProviderPayoutReference(): string {
  return `SC-PAYOUT-${randomBytes(10).toString('hex').toUpperCase()}`;
}
