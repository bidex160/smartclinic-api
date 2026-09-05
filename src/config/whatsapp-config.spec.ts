import 'reflect-metadata';
import { createAppConfiguration } from './environment';
import { validateEnvironment } from './env.validation';

describe('WhatsApp configuration', () => {
  it('is disabled by default and reads Meta configuration only from environment', () => {
    const config = createAppConfiguration({ NODE_ENV: 'test', WHATSAPP_ENABLED: 'true', WHATSAPP_META_ACCESS_TOKEN: 'token', WHATSAPP_META_PHONE_NUMBER_ID: '123', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify', WHATSAPP_META_APP_SECRET: 'secret' } as NodeJS.ProcessEnv);
    expect(config.whatsapp).toMatchObject({ enabled: true, accessToken: 'token', phoneNumberId: '123', webhookVerifyToken: 'verify', appSecret: 'secret', graphApiBaseUrl: 'https://graph.facebook.com', graphApiVersion: 'v23.0' });
    expect(createAppConfiguration({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).whatsapp.enabled).toBe(false);
  });

  it('rejects enabling delivery without required Meta delivery/verification settings', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'test', WHATSAPP_ENABLED: 'true' })).toThrow(/Meta WhatsApp/);
  });
});
