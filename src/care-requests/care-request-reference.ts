import { randomUUID } from 'node:crypto';
import { QueryFailedError } from 'typeorm';

export const CARE_REQUEST_REFERENCE_CONSTRAINT = 'UQ_care_requests_reference';
export const MAX_CARE_REQUEST_REFERENCE_ATTEMPTS = 3;
export function generateCareRequestReference(): string { return `SC-CARE-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`; }
export function isCareRequestReferenceCollision(error: unknown): boolean { return error instanceof QueryFailedError && (error.driverError as { code?: string; constraint?: string }).code === '23505' && (error.driverError as { constraint?: string }).constraint === CARE_REQUEST_REFERENCE_CONSTRAINT; }
