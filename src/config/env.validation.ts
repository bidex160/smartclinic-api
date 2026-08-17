import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, validateSync } from 'class-validator';

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
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.toString()}`);
  }

  return validatedConfig;
}
