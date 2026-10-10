import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { environmentSchema } from './config/environment.schema.js';
import { createTypeOrmOptions } from './database/typeorm-options.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { ClassesModule } from './modules/classes/classes.module.js';
import { CommerceModule } from './modules/commerce/commerce.module.js';
import { CourseBrowseModule } from './modules/course-browse/course-browse.module.js';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MaterialsModule } from './modules/materials/materials.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: environmentSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createTypeOrmOptions,
    }),
    HealthModule,
    UsersModule,
    AuthModule,
    CatalogModule,
    EnrollmentsModule,
    ClassesModule,
    CourseBrowseModule,
    CommerceModule,
    PaymentsModule,
    MaterialsModule,
  ],
})
export class AppModule {}
