import 'reflect-metadata';
import { createAppConfiguration } from './environment';
import { validateEnvironment } from './env.validation';

describe('email renderer configuration', () => {
  it('supports optional logo URL and normalizes the public frontend URL source', () => {
    const config = createAppConfiguration({
      NODE_ENV: 'test',
      FRONTEND_URL: 'https://smartclinicnetwork.com/',
      EMAIL_LOGO_URL: 'https://cdn.example.test/logo.png',
    } as NodeJS.ProcessEnv);
    expect(config.frontendUrl).toBe('https://smartclinicnetwork.com/');
    expect(config.email.logoUrl).toBe('https://cdn.example.test/logo.png');
  });

  it('does not require a logo URL in test/local environments', () => {
    expect(createAppConfiguration({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).email.logoUrl).toBeUndefined();
  });

  it('rejects invalid logo URLs through normal environment validation', () => {
    expect(() => validateEnvironment({
      NODE_ENV: 'test',
      EMAIL_LOGO_URL: 'javascript:alert(1)',
    })).toThrow('Invalid environment configuration');
  });
});
