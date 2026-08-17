import { QueryFailedError } from 'typeorm';
import { randomUUID } from 'node:crypto';

export const BOOKING_REFERENCE_CONSTRAINT = 'UQ_bookings_booking_reference';
export const MAX_BOOKING_REFERENCE_GENERATION_ATTEMPTS = 3;

export function generateBookingReference(): string {
  const year = new Date().getUTCFullYear();
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  return `SC-${year}-${suffix}`;
}

export function isBookingReferenceCollision(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string; constraint?: string }).code === '23505' &&
    (error.driverError as { constraint?: string }).constraint === BOOKING_REFERENCE_CONSTRAINT
  );
}
