import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Mindy Center API')
    .setDescription('API for course operations, enrollment, ordering and payments.')
    .setVersion('1.0')
    .addCookieAuth(
      'access_token',
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'HttpOnly access cookie set by POST /api/v1/auth/login',
      },
      'access_token',
    )
    .addCookieAuth(
      'refresh_token',
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'HttpOnly refresh cookie sent only to /api/v1/auth/refresh',
      },
      'refresh_token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      withCredentials: true,
    },
  });
}
