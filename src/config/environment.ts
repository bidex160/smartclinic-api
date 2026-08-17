export type EnvironmentName = 'development' | 'test' | 'production';

export interface AppConfiguration {
  environment: EnvironmentName;
  port: number;
  frontendUrl: string;
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
