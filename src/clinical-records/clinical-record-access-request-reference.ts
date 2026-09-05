import { randomUUID } from 'node:crypto';

export const CLINICAL_RECORD_ACCESS_REQUEST_REFERENCE_PATTERN = /^SC-CRR-[A-F0-9]{12}$/;
export const CLINICAL_RECORD_ACCESS_REQUEST_REFERENCE_EXAMPLE = 'SC-CRR-A1B2C3D4E5F6';
export const generateClinicalRecordAccessRequestReference = () =>
  `SC-CRR-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
