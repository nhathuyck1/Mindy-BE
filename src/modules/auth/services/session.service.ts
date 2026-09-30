import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { UserEntity } from '../../users/user.entity.js';
import type { UserRole } from '../../users/user-role.enum.js';
import type { AuthenticationContext, AuthTokens } from '../auth.types.js';
import { AuthSessionEntity } from '../auth-session.entity.js';
import type { AuthenticationMethod } from '../authentication-method.enum.js';
import { RefreshTokenEntity } from '../refresh-token.entity.js';
import { UserIdentityEntity } from '../user-identity.entity.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { PasswordService } from './password.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TokenService } from './token.service.js';

@Injectable()
export class SessionService {
  constructor(
    private readonly config: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async create(
    manager: EntityManager,
    user: { id: string; role: UserRole },
    context: AuthenticationContext,
    authenticationMethod: AuthenticationMethod,
    identityId: string | null,
  ): Promise<AuthTokens> {
    const now = new Date();
    const refreshTtlSeconds = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_SECONDS');
    const sessionRepository = manager.getRepository(AuthSessionEntity);
    const refreshRepository = manager.getRepository(RefreshTokenEntity);
    const session = await sessionRepository.save(
      sessionRepository.create({
        userId: user.id,
        identityId,
        authenticationMethod,
        deviceName: context.deviceName,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + refreshTtlSeconds * 1000),
        revokedAt: null,
      }),
    );
    const rawRefreshToken = randomBytes(32).toString('base64url');
    await refreshRepository.save(
      refreshRepository.create({
        sessionId: session.id,
        tokenHash: this.passwordService.hashRefreshToken(rawRefreshToken),
        parentTokenId: null,
        replacedByTokenId: null,
        expiresAt: session.expiresAt,
        usedAt: null,
        revokedAt: null,
      }),
    );
    await manager.update(UserEntity, { id: user.id }, { lastLoginAt: now });
    if (identityId !== null) {
      await manager.update(UserIdentityEntity, { id: identityId }, { lastLoginAt: now });
    }

    const accessToken = this.tokenService.signAccessToken({
      userId: user.id,
      sessionId: session.id,
      role: user.role,
    });
    return {
      accessToken: accessToken.token,
      refreshToken: rawRefreshToken,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshTokenExpiresAt: session.expiresAt,
    };
  }
}
