import { config } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { createAppConfiguration } from '../config/environment';

config();

const appConfiguration = createAppConfiguration();

export default new DataSource({
  type: 'postgres',
  host: appConfiguration.database.host,
  port: appConfiguration.database.port,
  username: appConfiguration.database.username,
  password: appConfiguration.database.password,
  database: appConfiguration.database.name,
  entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
  migrationsRun: false,
  synchronize: false,
});
