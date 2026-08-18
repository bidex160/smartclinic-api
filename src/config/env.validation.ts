import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength, validateSync } from 'class-validator';

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
  FRONTEND_URL = 'http://localhost:4200';

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

  @Type(() => Number) @IsInt() @Min(60)
  PUBLIC_BOOKING_SESSION_TTL = 604800;

  @IsOptional() @IsIn(['true', 'false'])
  PUBLIC_BOOKING_COOKIE_SECURE?: string;

  @IsOptional() @IsIn(['lax', 'strict', 'none'])
  PUBLIC_BOOKING_COOKIE_SAME_SITE?: string;

  @IsOptional() @IsString()
  PUBLIC_BOOKING_COOKIE_DOMAIN?: string;
  @IsIn(['none', 'test', 'paystack']) PAYMENT_PROVIDER = process.env.NODE_ENV === 'test' ? 'test' : 'none';
  @IsOptional() @IsString() PAYSTACK_SECRET_KEY?: string;
  @IsOptional() @IsString() PAYSTACK_PUBLIC_KEY?: string;
  @IsOptional() @IsString() PAYSTACK_CALLBACK_URL?: string;
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

  return validatedConfig;
}
