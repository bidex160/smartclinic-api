import 'reflect-metadata';
import { validateEnvironment } from './env.validation';

describe('Provider invitation configuration', () => {
  const production = { NODE_ENV: 'production', PORT: 3000, DATABASE_HOST: 'localhost', DATABASE_PORT: 5432, DATABASE_USERNAME: 'postgres', DATABASE_PASSWORD: '', DATABASE_NAME: 'smartclinic', FRONTEND_URL: 'https://app.example.test', JWT_SECRET: 'x'.repeat(32), JWT_EXPIRES_IN: '15m', PROVIDER_OFFER_TTL_MINUTES: 30, PUBLIC_BOOKING_SESSION_TTL: 604800, PAYMENT_PROVIDER: 'none' };
  it('requires an explicit TTL in production', () => expect(() => validateEnvironment(production)).toThrow('PROVIDER_INVITATION_TTL'));
  it('accepts an explicit production TTL', () => expect(validateEnvironment({ ...production, PROVIDER_INVITATION_TTL: 86400 }).PROVIDER_INVITATION_TTL).toBe(86400));
});
