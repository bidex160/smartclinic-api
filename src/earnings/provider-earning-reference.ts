import { randomBytes } from 'node:crypto';
export const PROVIDER_EARNING_REFERENCE_PATTERN = /^SC-EARN-[A-F0-9]{24}$/;
export function generateProviderEarningReference(): string { return `SC-EARN-${randomBytes(12).toString('hex').toUpperCase()}`; }
