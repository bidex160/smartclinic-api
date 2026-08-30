import { randomBytes } from 'node:crypto';
export const CLINICAL_ORDER_REFERENCE_PATTERN=/^SC-ORD-[A-F0-9]{12}$/;
export function generateClinicalOrderReference(){return `SC-ORD-${randomBytes(6).toString('hex').toUpperCase()}`;}
