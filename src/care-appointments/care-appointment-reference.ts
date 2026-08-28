import { randomUUID } from 'node:crypto';
import { QueryFailedError } from 'typeorm';

export const CARE_APPOINTMENT_REFERENCE_CONSTRAINT = 'UQ_care_appointments_reference';
export const CARE_APPOINTMENT_REFERENCE_PATTERN = /^SC-APT-[A-F0-9]{12}$/;
export const CARE_APPOINTMENT_REFERENCE_EXAMPLE = 'SC-APT-ABCDEF123456';
export const MAX_CARE_APPOINTMENT_REFERENCE_ATTEMPTS = 3;
export const generateCareAppointmentReference = () => `SC-APT-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
export const isCareAppointmentReferenceCollision = (error: unknown) => error instanceof QueryFailedError && (error.driverError as { code?: string; constraint?: string }).code === '23505' && (error.driverError as { constraint?: string }).constraint === CARE_APPOINTMENT_REFERENCE_CONSTRAINT;
