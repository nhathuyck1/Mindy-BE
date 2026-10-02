import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from '../users/users.controller.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthSessionEntity } from './auth-session.entity.js';
import { EmailVerificationTokenEntity } from './email-verification-token.entity.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { RefreshTokenEntity } from './refresh-token.entity.js';
import { RegistrationIntentEntity } from './registration-intent.entity.js';
import { GoogleOidcService } from './services/google-oidc.service.js';
import { MailService } from './services/mail.service.js';
import { PasswordService } from './services/password.service.js';
import { RegistrationService } from './services/registration.service.js';
import { SessionService } from './services/session.service.js';
import { TokenService } from './services/token.service.js';
import { UserIdentityEntity } from './user-identity.entity.js';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    TypeOrmModule.forFeature([
      AuthSessionEntity,
      RefreshTokenEntity,
      UserIdentityEntity,
      RegistrationIntentEntity,
      EmailVerificationTokenEntity,
    ]),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    RegistrationService,
    SessionService,
    GoogleOidcService,
    MailService,
    AccessTokenGuard,
    RolesGuard,
    PasswordService,
    TokenService,
  ],
  // AuthService is exported because AccessTokenGuard depends on it wherever the guard is used.
  exports: [AccessTokenGuard, RolesGuard, PasswordService, TokenService, AuthService],
})
export class AuthModule {}
