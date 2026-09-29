import 'dotenv/config';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DataSource } from 'typeorm';

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required to use the TypeORM migration CLI.');
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  synchronize: false,
  logging: process.env.DATABASE_LOGGING === 'true',
  entities: [join(currentDirectory, '../modules/**/*.entity.{ts,js}')],
  migrations: [join(currentDirectory, 'migrations/*.{ts,js}')],
});
