import 'reflect-metadata';
import { createAppConfiguration } from './environment';
import { validateEnvironment } from './env.validation';

describe('provider offer expiry configuration', () => {
  it('enables periodic processing outside tests and allows an explicit off switch', () => {
    expect(createAppConfiguration({ NODE_ENV: 'production' }).providerMatching).toMatchObject({ expiryWorkerEnabled: true, expiryIntervalMs: 60000 });
    expect(createAppConfiguration({ NODE_ENV: 'production', PROVIDER_OFFER_EXPIRY_ENABLED: 'false' }).providerMatching.expiryWorkerEnabled).toBe(false);
    expect(createAppConfiguration({ NODE_ENV: 'test' }).providerMatching.expiryWorkerEnabled).toBe(false);
  });
  it('uses the configured processing interval', () => {
    expect(createAppConfiguration({ PROVIDER_OFFER_EXPIRY_INTERVAL_MS: '15000' }).providerMatching.expiryIntervalMs).toBe(15000);
  });
  it('rejects unsafe timer intervals at configuration validation', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-configuration-test-only', PROVIDER_OFFER_EXPIRY_INTERVAL_MS: '0' })).toThrow('PROVIDER_OFFER_EXPIRY_INTERVAL_MS');
  });
});
