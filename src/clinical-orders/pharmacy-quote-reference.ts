import { randomBytes } from 'crypto';
export const generatePharmacyQuoteReference=()=>`SC-PHQ-${randomBytes(6).toString('hex').toUpperCase()}`;
export const PHARMACY_QUOTE_REFERENCE_PATTERN=/^SC-PHQ-[A-F0-9]{12}$/;
