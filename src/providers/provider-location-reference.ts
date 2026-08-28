import { randomUUID } from 'node:crypto';

export const PROVIDER_LOCATION_REFERENCE_PATTERN = /^SCPL-[A-F0-9]{16}$/;
export const PROVIDER_LOCATION_REFERENCE_EXAMPLE = 'SCPL-ABCDEF0123456789';
export const generateProviderLocationReference = () => `SCPL-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
