import { randomBytes } from 'node:crypto';

export const generateFastTrackReference = () => `SC-FT-${randomBytes(8).toString('hex').toUpperCase()}`;
export const MAX_FASTTRACK_REFERENCE_ATTEMPTS = 5;
export const isFastTrackReferenceCollision = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string; constraint?: string }).code === '23505' && (error as { constraint?: string }).constraint === 'UQ_fasttrack_requests_reference';
