import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'node:path';

import { appConfig } from '../config/app.config';
import { createAppConfiguration } from '../config/environment';

const configuration = createAppConfiguration();

@Module({
  imports: configuration.database.enabled
    ? [
        TypeOrmModule.forRootAsync({
          inject: [appConfig.KEY],
          useFactory: (
            config: ConfigType<typeof appConfig>,
          ): TypeOrmModuleOptions => ({
            type: 'postgres',
            host: config.database.host,
            port: config.database.port,
            username: config.database.username,
            password: config.database.password,
            database: config.database.name,
            autoLoadEntities: true,
            migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
            migrationsRun: config.database.migrationsRun,
            synchronize: config.database.synchronize,
            retryAttempts: 0,
          }),
        }),
      ]
    : [],
})
export class DatabaseModule {}
