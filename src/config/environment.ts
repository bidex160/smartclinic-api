export type EnvironmentName = 'development' | 'test' | 'production';

export interface AppConfiguration {
  environment: EnvironmentName;
  port: number;
  frontendUrl: string;
  auth: { jwtSecret: string; jwtExpiresIn: string; refreshTokenTtl: number; cookieSecure: boolean; cookieSameSite: 'lax'|'strict'|'none'; cookieDomain?: string };
  providerMatching: { offerTtlMinutes: number };
  providerInvitations: { ttlSeconds: number };
  publicBookingSession: { ttlSeconds: number; cookieSecure: boolean; cookieSameSite: 'lax'|'strict'|'none'; cookieDomain?: string };
  payments: { provider: 'none'|'test'|'paystack'; verificationMinIntervalSeconds: number; paystack: { secretKey?: string; publicKey?: string; callbackUrl?: string; webhookEnabled: boolean } };
  database: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    synchronize: boolean;
    migrationsRun: false;
  };
}

function getNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function createAppConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfiguration {
  const environmentName = (environment.NODE_ENV ?? 'development') as EnvironmentName;

  return {
    environment: environmentName,
    port: getNumber(environment.PORT, 3000),
    frontendUrl: environment.FRONTEND_URL ?? 'http://localhost:4200',
    auth: {
      jwtSecret: environment.JWT_SECRET ?? (environmentName === 'test' ? 'test-only-jwt-secret-must-not-be-used-in-production' : ''),
      jwtExpiresIn: environment.JWT_EXPIRES_IN ?? '15m',
      refreshTokenTtl: getNumber(environment.AUTH_REFRESH_TOKEN_TTL, 60 * 60 * 24 * 14),
      cookieSecure: environment.AUTH_COOKIE_SECURE === 'true' || environmentName === 'production',
      cookieSameSite: (environment.AUTH_COOKIE_SAME_SITE as 'lax'|'strict'|'none' | undefined) ?? 'lax',
      cookieDomain: environment.AUTH_COOKIE_DOMAIN,
    },
    providerMatching: {
      offerTtlMinutes: getNumber(environment.PROVIDER_OFFER_TTL_MINUTES, 30),
    },
    providerInvitations: { ttlSeconds: getNumber(environment.PROVIDER_INVITATION_TTL, 60 * 60 * 24 * 7) },
    publicBookingSession: {
      ttlSeconds: getNumber(environment.PUBLIC_BOOKING_SESSION_TTL, 60 * 60 * 24 * 7),
      cookieSecure: environment.PUBLIC_BOOKING_COOKIE_SECURE === 'true' || environmentName === 'production',
      cookieSameSite: (environment.PUBLIC_BOOKING_COOKIE_SAME_SITE as 'lax'|'strict'|'none' | undefined) ?? 'lax',
      cookieDomain: environment.PUBLIC_BOOKING_COOKIE_DOMAIN,
    },
    payments: { provider: (environment.PAYMENT_PROVIDER as 'none'|'test'|'paystack' | undefined) ?? (environmentName === 'test' ? 'test' : 'none'), verificationMinIntervalSeconds: Number(environment.PAYMENT_VERIFICATION_MIN_INTERVAL_SECONDS ?? 30), paystack: { secretKey: environment.PAYSTACK_SECRET_KEY, publicKey: environment.PAYSTACK_PUBLIC_KEY, callbackUrl: environment.PAYSTACK_CALLBACK_URL, webhookEnabled: environment.PAYSTACK_WEBHOOK_ENABLED !== 'false' } },
    database: {
      enabled: environment.DATABASE_ENABLED !== 'false',
      host: environment.DATABASE_HOST ?? 'localhost',
      port: getNumber(environment.DATABASE_PORT, 5432),
      username: environment.DATABASE_USERNAME ?? 'postgres',
      password: environment.DATABASE_PASSWORD ?? '',
      name: environment.DATABASE_NAME ?? 'smartclinic',
      synchronize:
        environmentName === 'development' && environment.TYPEORM_SYNCHRONIZE === 'true',
      migrationsRun: false,
    },
  };
}
