import { randomBytes } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const MAX_PATIENT_REFERENCE_GENERATION_ATTEMPTS = 5;

export function generatePatientReference(): string {
  const bytes = randomBytes(8);
  let value = '';
  for (let index = 0; index < 8; index += 1) value += ALPHABET[bytes[index] % ALPHABET.length];
  return `SCP-${value.slice(0, 4)}-${value.slice(4)}`;
}

export function isPatientReferenceCollision(error: unknown): boolean {
  const candidate = error as { driverError?: { constraint?: string } };
  return candidate.driverError?.constraint === 'UQ_patients_patient_reference';
}
