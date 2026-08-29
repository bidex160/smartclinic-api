import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Min, MinLength, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV = 'development';

  @Type(() => Number)
  @IsInt()
  PORT = 3000;

  @IsString()
  DATABASE_HOST = 'localhost';

  @Type(() => Number)
  @IsInt()
  DATABASE_PORT = 5432;

  @IsString()
  DATABASE_USERNAME = 'postgres';

  @IsOptional()
  @IsString()
  DATABASE_PASSWORD = '';

  @IsString()
  DATABASE_NAME = 'smartclinic';

  @IsString()
  FRONTEND_URL = 'http://localhost:3500';

  @IsOptional()
  @IsIn(['true', 'false'])
  TYPEORM_SYNCHRONIZE?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  DATABASE_ENABLED?: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET = process.env.NODE_ENV === 'test' ? 'test-only-jwt-secret-must-not-be-used-in-production' : undefined as never;

  @IsString()
  JWT_EXPIRES_IN = '15m';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PROVIDER_OFFER_TTL_MINUTES = 30;

  @Type(() => Number) @IsInt() @Min(300)
  PROVIDER_INVITATION_TTL = 604800;

  @Type(() => Number) @IsInt() @Min(300)
  HEALTH_RESULT_ACCESS_TTL = 604800;

  @IsIn(['none', 'cloudinary']) CLINICAL_ATTACHMENT_STORAGE_PROVIDER = 'none';
  @IsOptional() @IsString() CLOUDINARY_CLOUD_NAME?: string;
  @IsOptional() @IsString() CLOUDINARY_API_KEY?: string;
  @IsOptional() @IsString() CLOUDINARY_API_SECRET?: string;
  @Type(() => Number) @IsInt() @Min(60) CLINICAL_ATTACHMENT_ACCESS_TTL_SECONDS = 300;

  @IsOptional() @IsUrl({ require_tld: false }) PROVIDER_INVITATION_FRONTEND_URL?: string;
  @IsIn(['none', 'test', 'resend']) EMAIL_PROVIDER = process.env.NODE_ENV === 'test' ? 'test' : 'none';
  @IsOptional() @IsString() EMAIL_FROM_ADDRESS: string | undefined = process.env.NODE_ENV === 'test' ? 'no-reply@smartclinic.invalid' : undefined;
  @IsOptional() @IsString() EMAIL_FROM_NAME: string | undefined = process.env.NODE_ENV === 'test' ? 'SmartClinic' : undefined;
  @IsOptional() @IsString() RESEND_API_KEY?: string;
  @Type(() => Number) @IsInt() @Min(1000) EMAIL_SEND_TIMEOUT_MS = 10000;

  @Type(() => Number) @IsInt() @Min(60)
  PUBLIC_BOOKING_SESSION_TTL = 604800;

  @IsOptional() @IsIn(['true', 'false'])
  PUBLIC_BOOKING_COOKIE_SECURE?: string;

  @IsOptional() @IsIn(['lax', 'strict', 'none'])
  PUBLIC_BOOKING_COOKIE_SAME_SITE?: string;

  @IsOptional() @IsString()
  PUBLIC_BOOKING_COOKIE_DOMAIN?: string;
  @IsIn(['none', 'test', 'paystack']) PAYMENT_PROVIDER = process.env.NODE_ENV === 'test' ? 'test' : 'none';
  @Type(() => Number) @IsInt() @Min(1) PAYMENT_VERIFICATION_MIN_INTERVAL_SECONDS = 30;
  @IsOptional() @IsString() PAYSTACK_SECRET_KEY?: string;
  @IsOptional() @IsString() PAYSTACK_PUBLIC_KEY?: string;
  @IsOptional() @IsString() PAYSTACK_CALLBACK_URL?: string;
  @IsOptional() @IsUrl({ require_tld: false }) PAYSTACK_PATIENT_CALLBACK_URL?: string;
  @IsOptional() @IsIn(['true', 'false']) PAYSTACK_WEBHOOK_ENABLED?: string;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.toString()}`);
  }
  if (validatedConfig.NODE_ENV === 'production' && validatedConfig.PAYMENT_PROVIDER === 'paystack' && !validatedConfig.PAYSTACK_SECRET_KEY) throw new Error('Invalid environment configuration: PAYSTACK_SECRET_KEY is required when PAYMENT_PROVIDER=paystack');
  if (validatedConfig.NODE_ENV === 'production' && validatedConfig.PAYMENT_PROVIDER === 'test') throw new Error('Invalid environment configuration: PAYMENT_PROVIDER=test is not allowed in production');
  if (validatedConfig.NODE_ENV === 'production' && config.PROVIDER_INVITATION_TTL === undefined) throw new Error('Invalid environment configuration: PROVIDER_INVITATION_TTL is required in production');
  if (validatedConfig.NODE_ENV === 'production' && !validatedConfig.PROVIDER_INVITATION_FRONTEND_URL) throw new Error('Invalid environment configuration: PROVIDER_INVITATION_FRONTEND_URL is required in production');
  if (validatedConfig.NODE_ENV === 'production' && validatedConfig.EMAIL_PROVIDER === 'test') throw new Error('Invalid environment configuration: EMAIL_PROVIDER=test is not allowed in production');
  if (validatedConfig.EMAIL_PROVIDER !== 'none' && !validatedConfig.EMAIL_FROM_ADDRESS) throw new Error('Invalid environment configuration: EMAIL_FROM_ADDRESS is required when email delivery is configured');
  if (validatedConfig.EMAIL_PROVIDER === 'resend' && !validatedConfig.RESEND_API_KEY) throw new Error('Invalid environment configuration: RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
  if (validatedConfig.CLINICAL_ATTACHMENT_STORAGE_PROVIDER === 'cloudinary' && (!validatedConfig.CLOUDINARY_CLOUD_NAME || !validatedConfig.CLOUDINARY_API_KEY || !validatedConfig.CLOUDINARY_API_SECRET)) throw new Error('Invalid environment configuration: Cloudinary clinical attachment credentials are required when CLINICAL_ATTACHMENT_STORAGE_PROVIDER=cloudinary');

  return validatedConfig;
}
