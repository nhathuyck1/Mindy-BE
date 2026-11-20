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
        description:
          'HttpOnly access cookie set after password login, email verification, or Google authentication',
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
    .addCookieAuth(
      'registration_intent',
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'Short-lived HttpOnly cookie used only to complete Google registration',
      },
      'registration_intent',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      withCredentials: true,
    },
  });
}
