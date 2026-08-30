import { randomBytes } from 'crypto';
export const CLINICAL_ORDER_FULFILLMENT_REFERENCE_PATTERN = /^SC-ORF-[A-F0-9]{12}$/;
export const generateClinicalOrderFulfillmentReference = () => `SC-ORF-${randomBytes(6).toString('hex').toUpperCase()}`;
