export type EnvironmentName = "development" | "test" | "production";

export interface AppConfiguration {
  environment: EnvironmentName;
  port: number;
  frontendUrl: string;
  auth: {
    jwtSecret: string;
    jwtExpiresIn: string;
    refreshTokenTtl: number;
    cookieSecure: boolean;
    cookieSameSite: "lax" | "strict" | "none";
    cookieDomain?: string;
    passwordResetTokenTtlMinutes: number;
  };
  providerMatching: { offerTtlMinutes: number };
  providerInvitations: { ttlSeconds: number; frontendUrl: string };
  healthResults: { guestAccessTtlSeconds: number };
  guidedSelfCheckAi: {
    provider: 'none' | 'openai';
    openAiApiKey?: string;
    openAiModel?: string;
    timeoutMs: number;
    maxRetries: number;
  };
  clinicalAttachments: {
    provider: 'none' | 'cloudinary';
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string;
    accessTtlSeconds: number;
  };
  email: {
    provider: "none" | "test" | "resend";
    fromAddress: string;
    fromName?: string;
    resendApiKey?: string;
    sendTimeoutMs: number;
    contactToAddress: string;
  };
  whatsapp: {
    enabled: boolean;
    accessToken?: string;
    phoneNumberId?: string;
    webhookVerifyToken?: string;
    appSecret?: string;
    graphApiBaseUrl: string;
    graphApiVersion: string;
    sendTimeoutMs: number;
  };
  publicBookingSession: {
    ttlSeconds: number;
    cookieSecure: boolean;
    cookieSameSite: "lax" | "strict" | "none";
    cookieDomain?: string;
  };
  payments: {
    provider: "none" | "test" | "paystack" | "opay";
    verificationMinIntervalSeconds: number;
    paystack: {
      secretKey?: string;
      publicKey?: string;
      callbackUrl?: string;
      patientCallbackUrl?: string;
      webhookEnabled: boolean;
    };
    opay: {
      baseUrl: string;
      merchantId?: string;
      publicKey?: string;
      privateKey?: string;
      callbackUrl?: string;
      returnUrl?: string;
      webhookEnabled: boolean;
    };
  };
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
  const environmentName = (environment.NODE_ENV ??
    "development") as EnvironmentName;

  return {
    environment: environmentName,
    port: getNumber(environment.PORT, 3000),
    frontendUrl: environment.FRONTEND_URL ?? "http://localhost:3500",
    auth: {
      jwtSecret:
        environment.JWT_SECRET ??
        (environmentName === "test"
          ? "test-only-jwt-secret-must-not-be-used-in-production"
          : ""),
      jwtExpiresIn: environment.JWT_EXPIRES_IN ?? "15m",
      refreshTokenTtl: getNumber(
        environment.AUTH_REFRESH_TOKEN_TTL,
        60 * 60 * 24 * 14,
      ),
      cookieSecure:
        environment.AUTH_COOKIE_SECURE === "true" ||
        environmentName === "production",
      cookieSameSite:
        (environment.AUTH_COOKIE_SAME_SITE as
          | "lax"
          | "strict"
          | "none"
          | undefined) ?? "lax",
      passwordResetTokenTtlMinutes: getNumber(environment.PASSWORD_RESET_TOKEN_TTL_MINUTES, 30),
      cookieDomain: environment.AUTH_COOKIE_DOMAIN,
    },
    providerMatching: {
      offerTtlMinutes: getNumber(environment.PROVIDER_OFFER_TTL_MINUTES, 30),
    },
    providerInvitations: {
      ttlSeconds: getNumber(
        environment.PROVIDER_INVITATION_TTL,
        60 * 60 * 24 * 7,
      ),
      frontendUrl:
        environment.PROVIDER_INVITATION_FRONTEND_URL ??
        `${(environment.FRONTEND_URL ?? "http://localhost:3500").replace(/\/$/, "")}/provider/setup`,
    },
    healthResults: {
      guestAccessTtlSeconds: getNumber(
        environment.HEALTH_RESULT_ACCESS_TTL,
        60 * 60 * 24 * 7,
      ),
    },
    guidedSelfCheckAi: {
      provider: (environment.GUIDED_SELF_CHECK_AI_PROVIDER as 'none' | 'openai' | undefined) ?? 'none',
      openAiApiKey: environment.OPENAI_API_KEY,
      openAiModel: environment.GUIDED_SELF_CHECK_OPENAI_MODEL,
      timeoutMs: getNumber(environment.GUIDED_SELF_CHECK_OPENAI_TIMEOUT_MS, 15_000),
      maxRetries: getNumber(environment.GUIDED_SELF_CHECK_OPENAI_MAX_RETRIES, 1),
    },
    clinicalAttachments: {
      provider: (environment.CLINICAL_ATTACHMENT_STORAGE_PROVIDER as 'none' | 'cloudinary' | undefined) ?? 'none',
      cloudName: environment.CLOUDINARY_CLOUD_NAME,
      apiKey: environment.CLOUDINARY_API_KEY,
      apiSecret: environment.CLOUDINARY_API_SECRET,
      accessTtlSeconds: getNumber(environment.CLINICAL_ATTACHMENT_ACCESS_TTL_SECONDS, 300),
    },
    email: {
      provider:
        (environment.EMAIL_PROVIDER as
          | "none"
          | "test"
          | "resend"
          | undefined) ?? (environmentName === "test" ? "test" : "none"),
      fromAddress:
        environment.EMAIL_FROM_ADDRESS ?? "no-reply@smartclinic.invalid",
      contactToAddress: environment.CONTACT_TO_ADDRESS ?? "contact@smartclinic.invalid",
      fromName: environment.EMAIL_FROM_NAME,
      resendApiKey: environment.RESEND_API_KEY,
      sendTimeoutMs: getNumber(environment.EMAIL_SEND_TIMEOUT_MS, 10_000),
    },
    whatsapp: {
      enabled: environment.WHATSAPP_ENABLED === "true",
      accessToken: environment.WHATSAPP_META_ACCESS_TOKEN,
      phoneNumberId: environment.WHATSAPP_META_PHONE_NUMBER_ID,
      webhookVerifyToken: environment.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      appSecret: environment.WHATSAPP_META_APP_SECRET,
      graphApiBaseUrl: environment.WHATSAPP_META_GRAPH_API_BASE_URL ?? "https://graph.facebook.com",
      graphApiVersion: environment.WHATSAPP_META_GRAPH_API_VERSION ?? "v23.0",
      sendTimeoutMs: getNumber(environment.WHATSAPP_SEND_TIMEOUT_MS, 10_000),
    },
    publicBookingSession: {
      ttlSeconds: getNumber(
        environment.PUBLIC_BOOKING_SESSION_TTL,
        60 * 60 * 24 * 7,
      ),
      cookieSecure:
        environment.PUBLIC_BOOKING_COOKIE_SECURE === "true" ||
        environmentName === "production",
      cookieSameSite:
        (environment.PUBLIC_BOOKING_COOKIE_SAME_SITE as
          | "lax"
          | "strict"
          | "none"
          | undefined) ?? "lax",
      cookieDomain: environment.PUBLIC_BOOKING_COOKIE_DOMAIN,
    },
    payments: {
      provider:
        (environment.PAYMENT_PROVIDER as
          | "none"
          | "test"
          | "paystack"
          | "opay"
          | undefined) ?? (environmentName === "test" ? "test" : "none"),
      verificationMinIntervalSeconds: Number(
        environment.PAYMENT_VERIFICATION_MIN_INTERVAL_SECONDS ?? 30,
      ),
      paystack: {
        secretKey: environment.PAYSTACK_SECRET_KEY,
        publicKey: environment.PAYSTACK_PUBLIC_KEY,
        callbackUrl: environment.PAYSTACK_CALLBACK_URL,
        patientCallbackUrl: environment.PAYSTACK_PATIENT_CALLBACK_URL,
        webhookEnabled: environment.PAYSTACK_WEBHOOK_ENABLED !== "false",
      },
      opay: {
        baseUrl: environment.OPAY_BASE_URL ?? "https://testapi.opaycheckout.com",
        merchantId: environment.OPAY_MERCHANT_ID,
        publicKey: environment.OPAY_PUBLIC_KEY,
        privateKey: environment.OPAY_PRIVATE_KEY,
        callbackUrl: environment.OPAY_CALLBACK_URL,
        returnUrl: environment.OPAY_RETURN_URL,
        webhookEnabled: environment.OPAY_WEBHOOK_ENABLED !== "false",
      },
    },
    database: {
      enabled: environment.DATABASE_ENABLED !== "false",
      host: environment.DATABASE_HOST ?? "localhost",
      port: getNumber(environment.DATABASE_PORT, 5432),
      username: environment.DATABASE_USERNAME ?? "postgres",
      password: environment.DATABASE_PASSWORD ?? "",
      name: environment.DATABASE_NAME ?? "smartclinic",
      synchronize:
        environmentName === "development" &&
        environment.TYPEORM_SYNCHRONIZE === "true",
      migrationsRun: false,
    },
  };
}
