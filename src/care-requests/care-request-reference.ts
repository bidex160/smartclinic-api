import { randomUUID } from 'node:crypto';
import { QueryFailedError } from 'typeorm';

export const CARE_REQUEST_REFERENCE_CONSTRAINT = 'UQ_care_requests_reference';
export const MAX_CARE_REQUEST_REFERENCE_ATTEMPTS = 3;
export const CARE_REQUEST_REFERENCE_PREFIX = 'SC-CARE-';
export const CARE_REQUEST_REFERENCE_HEX_LENGTH = 12;
export const CARE_REQUEST_REFERENCE_PATTERN = /^SC-CARE-[A-F0-9]{12}$/;
export const CARE_REQUEST_REFERENCE_EXAMPLE = 'SC-CARE-ABCDEF123456';
export function generateCareRequestReference(): string { return `${CARE_REQUEST_REFERENCE_PREFIX}${randomUUID().replaceAll('-', '').slice(0, CARE_REQUEST_REFERENCE_HEX_LENGTH).toUpperCase()}`; }
export function isCareRequestReference(value: string): boolean { return CARE_REQUEST_REFERENCE_PATTERN.test(value); }
export function isCareRequestReferenceCollision(error: unknown): boolean { return error instanceof QueryFailedError && (error.driverError as { code?: string; constraint?: string }).code === '23505' && (error.driverError as { constraint?: string }).constraint === CARE_REQUEST_REFERENCE_CONSTRAINT; }
