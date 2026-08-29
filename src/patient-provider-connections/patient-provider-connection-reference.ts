import { randomBytes } from 'node:crypto';
export const PATIENT_PROVIDER_CONNECTION_REFERENCE_PATTERN = /^SC-PPC-[A-F0-9]{12}$/;
export const PATIENT_PROVIDER_CONNECTION_REFERENCE_EXAMPLE = 'SC-PPC-A1B2C3D4E5F6';
export function generatePatientProviderConnectionReference(): string {
  return `SC-PPC-${randomBytes(6).toString('hex').toUpperCase()}`;
}
