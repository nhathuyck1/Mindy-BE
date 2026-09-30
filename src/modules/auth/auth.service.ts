import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, IsNull } from 'typeorm';

import { UserStatus } from '../users/user-status.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { normalizeEmail, UsersService } from '../users/users.service.js';
import type { AuthenticatedUser, AuthenticationContext, AuthTokens } from './auth.types.js';
import { AuthSessionEntity } from './auth-session.entity.js';
import type { LoginDto } from './dtos/login.dto.js';
import {
  AuthenticationRequiredException,
  InvalidCredentialsException,
  InvalidRefreshTokenException,
} from './exceptions/auth.exceptions.js';
import { RefreshTokenEntity } from './refresh-token.entity.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { PasswordService } from './services/password.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TokenService } from './services/token.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async login(
    input: LoginDto,
    context: AuthenticationContext,
  ): Promise<{ tokens: AuthTokens; userId: string }> {
    const user = await this.usersService.findAuthenticationIdentity(normalizeEmail(input.email));
    if (user === null || user.status !== UserStatus.ACTIVE) {
      throw new InvalidCredentialsException();
    }

    const passwordValid = await this.passwordService.verifyPassword(
      input.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new InvalidCredentialsException();
    }

    const now = new Date();
    const refreshTtlSeconds = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_SECONDS');
    const accessPrincipalBase = { userId: user.id, role: user.role };

    const result = await this.dataSource.transaction(async (manager) => {
      const sessionRepository = manager.getRepository(AuthSessionEntity);
      const refreshRepository = manager.getRepository(RefreshTokenEntity);
      const session = await sessionRepository.save(
        sessionRepository.create({
          userId: user.id,
          deviceName: context.deviceName,
          userAgent: context.userAgent,
          ipAddress: context.ipAddress,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + refreshTtlSeconds * 1000),
          revokedAt: null,
        }),
      );
      const refreshToken = randomBytes(32).toString('base64url');
      await refreshRepository.save(
        refreshRepository.create({
          sessionId: session.id,
          tokenHash: this.passwordService.hashRefreshToken(refreshToken),
          parentTokenId: null,
          replacedByTokenId: null,
          expiresAt: session.expiresAt,
          usedAt: null,
          revokedAt: null,
        }),
      );
      await manager.update('users', { id: user.id }, { lastLoginAt: now });

      return { sessionId: session.id, refreshToken, refreshTokenExpiresAt: session.expiresAt };
    });

    const accessToken = this.tokenService.signAccessToken({
      ...accessPrincipalBase,
      sessionId: result.sessionId,
    });

    return {
      userId: user.id,
      tokens: {
        accessToken: accessToken.token,
        refreshToken: result.refreshToken,
        accessTokenExpiresAt: accessToken.expiresAt,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt,
      },
    };
  }

  async refresh(rawRefreshToken: string, context: AuthenticationContext): Promise<AuthTokens> {
    const tokenHash = this.passwordService.hashRefreshToken(rawRefreshToken);
    const now = new Date();
    const refreshTtlSeconds = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_SECONDS');

    const result = await this.dataSource.transaction(async (manager) => {
      const tokenRepository = manager.getRepository(RefreshTokenEntity);
      const sessionRepository = manager.getRepository(AuthSessionEntity);
      const token = await tokenRepository
        .createQueryBuilder('token')
        .setLock('pessimistic_write')
        .where('token.tokenHash = :tokenHash', { tokenHash })
        .getOne();

      if (token === null) {
        throw new InvalidRefreshTokenException();
      }

      const session = await sessionRepository
        .createQueryBuilder('session')
        .setLock('pessimistic_write')
        .where('session.id = :sessionId', { sessionId: token.sessionId })
        .getOne();

      if (
        session === null ||
        session.revokedAt !== null ||
        session.expiresAt.getTime() <= now.getTime()
      ) {
        throw new InvalidRefreshTokenException();
      }

      if (
        token.usedAt !== null ||
        token.revokedAt !== null ||
        token.expiresAt.getTime() <= now.getTime()
      ) {
        await sessionRepository.update({ id: session.id }, { revokedAt: now });
        await tokenRepository.update(
          { sessionId: session.id, revokedAt: IsNull() },
          { revokedAt: now },
        );
        throw new InvalidRefreshTokenException();
      }

      const user = await this.usersService.findById(session.userId);
      if (user.status !== UserStatus.ACTIVE) {
        await sessionRepository.update({ id: session.id }, { revokedAt: now });
        throw new InvalidRefreshTokenException();
      }

      const replacementRawToken = randomBytes(32).toString('base64url');
      const replacement = tokenRepository.create({
        sessionId: session.id,
        tokenHash: this.passwordService.hashRefreshToken(replacementRawToken),
        parentTokenId: token.id,
        replacedByTokenId: null,
        expiresAt: new Date(now.getTime() + refreshTtlSeconds * 1000),
        usedAt: null,
        revokedAt: null,
      });
      const savedReplacement = await tokenRepository.save(replacement);
      token.usedAt = now;
      token.replacedByTokenId = savedReplacement.id;
      await tokenRepository.save(token);
      session.lastSeenAt = now;
      session.expiresAt = savedReplacement.expiresAt;
      session.userAgent = context.userAgent ?? session.userAgent;
      session.ipAddress = context.ipAddress ?? session.ipAddress;
      session.deviceName = context.deviceName ?? session.deviceName;
      await sessionRepository.save(session);

      const accessToken = this.tokenService.signAccessToken({
        userId: user.id,
        sessionId: session.id,
        role: user.role,
      });

      return {
        accessToken: accessToken.token,
        refreshToken: replacementRawToken,
        accessTokenExpiresAt: accessToken.expiresAt,
        refreshTokenExpiresAt: savedReplacement.expiresAt,
      };
    });

    return result;
  }

  async logout(principal: AuthenticatedUser): Promise<void> {
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        AuthSessionEntity,
        { id: principal.sessionId, userId: principal.userId, revokedAt: IsNull() },
        { revokedAt: now },
      );
      await manager
        .createQueryBuilder()
        .update(RefreshTokenEntity)
        .set({ revokedAt: now })
        .where('session_id = :sessionId', { sessionId: principal.sessionId })
        .andWhere('revoked_at IS NULL')
        .execute();
    });
  }

  async logoutAll(userId: string): Promise<void> {
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      const sessions = await manager.find(AuthSessionEntity, {
        where: { userId, revokedAt: IsNull() },
      });
      await manager.update(AuthSessionEntity, { userId, revokedAt: IsNull() }, { revokedAt: now });
      if (sessions.length > 0) {
        await manager
          .createQueryBuilder()
          .update(RefreshTokenEntity)
          .set({ revokedAt: now })
          .where('session_id IN (:...sessionIds)', {
            sessionIds: sessions.map((session) => session.id),
          })
          .andWhere('revoked_at IS NULL')
          .execute();
      }
    });
  }

  async assertAccessPrincipalValid(principal: AuthenticatedUser): Promise<void> {
    const session = await this.dataSource.getRepository(AuthSessionEntity).findOne({
      where: { id: principal.sessionId, userId: principal.userId, revokedAt: IsNull() },
    });
    if (session === null || session.expiresAt.getTime() <= Date.now()) {
      throw new AuthenticationRequiredException();
    }

    const user = await this.usersService.findById(principal.userId);
    if (user.status !== UserStatus.ACTIVE || user.role !== principal.role) {
      throw new AuthenticationRequiredException();
    }
  }
}
