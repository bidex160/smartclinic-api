import { randomUUID } from 'node:crypto';
export const CLINICAL_RECORD_GRANT_REFERENCE_PATTERN = /^SC-CRG-[A-F0-9]{12}$/;
export const CLINICAL_RECORD_GRANT_REFERENCE_EXAMPLE = 'SC-CRG-A1B2C3D4E5F6';
export const generateClinicalRecordGrantReference = () => `SC-CRG-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
