import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from '../users/users.controller.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthSessionEntity } from './auth-session.entity.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { RefreshTokenEntity } from './refresh-token.entity.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    TypeOrmModule.forFeature([AuthSessionEntity, RefreshTokenEntity]),
  ],
  controllers: [AuthController, UsersController],
  providers: [AuthService, AccessTokenGuard, RolesGuard, PasswordService, TokenService],
  exports: [AccessTokenGuard, RolesGuard, PasswordService, TokenService],
})
export class AuthModule {}
