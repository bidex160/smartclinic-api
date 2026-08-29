import { randomUUID } from 'node:crypto';
import { QueryFailedError } from 'typeorm';

export const CLINICAL_RECORD_REFERENCE_CONSTRAINT = 'UQ_clinical_records_reference';
export const CLINICAL_RECORD_REFERENCE_PATTERN = /^SC-CLR-[A-F0-9]{12}$/;
export const CLINICAL_RECORD_REFERENCE_EXAMPLE = 'SC-CLR-ABCDEF123456';
export const MAX_CLINICAL_RECORD_REFERENCE_ATTEMPTS = 3;
export const generateClinicalRecordReference = () => `SC-CLR-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
export const isClinicalRecordReferenceCollision = (error: unknown) => error instanceof QueryFailedError && (error.driverError as { code?: string; constraint?: string }).code === '23505' && (error.driverError as { constraint?: string }).constraint === CLINICAL_RECORD_REFERENCE_CONSTRAINT;
