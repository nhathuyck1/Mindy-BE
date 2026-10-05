import { HttpStatus, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { requestContextMiddleware } from './common/http/request-context.js';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { setupSwagger } from './setup-swagger.js';

/** Same HTTP boundary for the production app and built-app HTTP tests. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.useBodyParser('json', { limit: '64kb' });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.enableShutdownHooks();
  if (config.getOrThrow<boolean>('SWAGGER_ENABLED')) setupSwagger(app);
}
