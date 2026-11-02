import { HttpStatus, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { requestContextMiddleware } from './common/http/request-context.js';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { questionsValidationException } from './modules/assignments/validation/questions-validation.js';
import { setupSwagger } from './setup-swagger.js';

/** Same HTTP boundary for the production app and built-app HTTP tests. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  // Register before the global parser: consuming this stream there would apply 64 KiB.
  app.useBodyParser('json', {
    limit: 1 * 1024 * 1024,
    type: (req) =>
      req.method === 'PUT' &&
      /^\/api\/v1\/mentor\/assignments\/[^/]+\/questions\/?(?:\?|$)/i.test(req.url ?? '') &&
      /^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? ''),
  });
  app.useBodyParser('json', {
    limit: '256kb',
    type: (req) =>
      /^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '') &&
      ((req.method === 'POST' &&
        /^\/api\/v1\/management\/class-sessions\/[^/]+\/attendance\/recover\/?(?:\?|$)/.test(
          req.url ?? '',
        )) ||
        // Phase 7: CODE source, tests and reference solutions exceed the 64kb default.
        ((req.method === 'PUT' || req.method === 'POST') &&
          /^\/api\/v1\/(?:mentor|me)\/(?:assignments\/[^/]+\/code-[a-z-]+(?:\/[^/?]+)?|code-[a-z-]+(?:\/[^/?]+)?)\/?(?:\?|$)/.test(
            req.url ?? '',
          ))),
  });
  app.useBodyParser('json', { limit: '64kb' });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  const defaultValidationException = new ValidationPipe({
    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  }).createExceptionFactory();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      exceptionFactory: (errors) =>
        questionsValidationException(errors) ?? defaultValidationException(errors),
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
