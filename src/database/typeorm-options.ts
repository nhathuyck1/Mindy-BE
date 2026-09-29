import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function createTypeOrmOptions(configService: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url: configService.getOrThrow<string>('DATABASE_URL'),
    autoLoadEntities: true,
    synchronize: false,
    migrationsRun: false,
    logging: configService.getOrThrow<boolean>('DATABASE_LOGGING'),
    migrations: ['dist/database/migrations/*.js'],
  };
}
