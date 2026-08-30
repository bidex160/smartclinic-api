import { randomBytes } from 'node:crypto';
export function generateProviderPayoutAccountReference(): string { return `SC-PACCT-${randomBytes(10).toString('hex').toUpperCase()}`; }
