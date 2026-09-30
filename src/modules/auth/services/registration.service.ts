import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, IsNull } from 'typeorm';
import { UserPhoneAlreadyExistsException } from '../../users/exceptions/user.exceptions.js';
import { UserEntity } from '../../users/user.entity.js';
import { UserRole } from '../../users/user-role.enum.js';
import { UserStatus } from '../../users/user-status.enum.js';
import { normalizeEmail, normalizeOptionalPhone } from '../../users/users.service.js';
import type { AuthenticationContext, AuthTokens } from '../auth.types.js';
import { AuthenticationMethod } from '../authentication-method.enum.js';
import type { CompleteGoogleRegistrationDto } from '../dtos/complete-google-registration.dto.js';
import type { RegisterDto } from '../dtos/register.dto.js';
import { EmailVerificationTokenEntity } from '../email-verification-token.entity.js';
import {
  GoogleAuthenticationFailedException,
  InvalidEmailVerificationTokenException,
  InvalidRegistrationIntentException,
} from '../exceptions/auth.exceptions.js';
import { RegistrationIntentEntity } from '../registration-intent.entity.js';
import { IdentityProvider, UserIdentityEntity } from '../user-identity.entity.js';
import type { GoogleProfile } from './google-oidc.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { MailService } from './mail.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { PasswordService } from './password.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { SessionService } from './session.service.js';

export type GoogleCallbackResult =
  | {
      readonly kind: 'authenticated';
      readonly userId: string;
      readonly tokens: AuthTokens;
      readonly returnTo: string;
    }
  | {
      readonly kind: 'onboarding';
      readonly onboardingToken: string;
      readonly maxAgeMilliseconds: number;
    };

@Injectable()
export class RegistrationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly mailService: MailService,
    private readonly sessionService: SessionService,
  ) {}

  async register(input: RegisterDto): Promise<void> {
    this.mailService.assertEnabled();
    const email = normalizeEmail(input.email);
    const phone = normalizeOptionalPhone(input.phone);
    const rawToken = randomBytes(32).toString('base64url');
    const passwordHash = await this.passwordService.hashPassword(input.password);
    const expiresAt = this.emailVerificationExpiry();

    let created = false;
    try {
      created = await this.dataSource.transaction(async (manager) => {
        const users = manager.getRepository(UserEntity);
        if (await users.exists({ where: { email } })) {
          return false;
        }
        if (phone !== null && (await users.exists({ where: { phone } }))) {
          return false;
        }

        const user = await users.save(
          users.create({
            email,
            phone,
            passwordHash,
            displayName: input.displayName.trim(),
            role: UserRole.STUDENT,
            status: UserStatus.PENDING_VERIFICATION,
            lastLoginAt: null,
          }),
        );
        const tokens = manager.getRepository(EmailVerificationTokenEntity);
        await tokens.save(
          tokens.create({
            userId: user.id,
            tokenHash: this.passwordService.hashRefreshToken(rawToken),
            expiresAt,
            usedAt: null,
          }),
        );
        return true;
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }

    if (created) {
      await this.mailService.sendVerificationEmail(email, rawToken);
    }
  }

  async resendVerification(emailInput: string): Promise<void> {
    this.mailService.assertEnabled();
    const email = normalizeEmail(emailInput);
    const now = new Date();
    const cooldownSeconds = this.config.getOrThrow<number>('EMAIL_RESEND_COOLDOWN_SECONDS');
    const rawToken = randomBytes(32).toString('base64url');

    const shouldSend = await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(UserEntity).findOne({
        where: { email, status: UserStatus.PENDING_VERIFICATION },
      });
      if (user === null) {
        return false;
      }

      const latest = await manager.getRepository(EmailVerificationTokenEntity).findOne({
        where: { userId: user.id },
        order: { createdAt: 'DESC' },
      });
      if (latest !== null && latest.createdAt.getTime() + cooldownSeconds * 1000 > now.getTime()) {
        return false;
      }

      const tokens = manager.getRepository(EmailVerificationTokenEntity);
      await tokens.save(
        tokens.create({
          userId: user.id,
          tokenHash: this.passwordService.hashRefreshToken(rawToken),
          expiresAt: this.emailVerificationExpiry(),
          usedAt: null,
        }),
      );
      return true;
    });

    if (shouldSend) {
      await this.mailService.sendVerificationEmail(email, rawToken);
    }
  }

  async verifyEmail(
    rawToken: string,
    context: AuthenticationContext,
  ): Promise<{ userId: string; tokens: AuthTokens }> {
    const tokenHash = this.passwordService.hashRefreshToken(rawToken);
    return this.dataSource.transaction(async (manager) => {
      const verification = await manager
        .getRepository(EmailVerificationTokenEntity)
        .createQueryBuilder('verification')
        .setLock('pessimistic_write')
        .where('verification.tokenHash = :tokenHash', { tokenHash })
        .getOne();
      const now = new Date();
      if (
        verification === null ||
        verification.usedAt !== null ||
        verification.expiresAt.getTime() <= now.getTime()
      ) {
        throw new InvalidEmailVerificationTokenException();
      }

      const user = await manager
        .getRepository(UserEntity)
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId: verification.userId })
        .getOne();
      if (
        user === null ||
        user.status !== UserStatus.PENDING_VERIFICATION ||
        user.passwordHash === null
      ) {
        throw new InvalidEmailVerificationTokenException();
      }

      user.status = UserStatus.ACTIVE;
      await manager.getRepository(UserEntity).save(user);
      await manager.update(
        EmailVerificationTokenEntity,
        { userId: user.id, usedAt: IsNull() },
        { usedAt: now },
      );
      const tokens = await this.sessionService.create(
        manager,
        user,
        context,
        AuthenticationMethod.PASSWORD,
        null,
      );
      return { userId: user.id, tokens };
    });
  }

  async handleGoogleCallback(
    profile: GoogleProfile,
    returnTo: string,
    context: AuthenticationContext,
  ): Promise<GoogleCallbackResult> {
    const onboardingToken = randomBytes(32).toString('base64url');
    const intentTtlSeconds = this.config.getOrThrow<number>('REGISTRATION_INTENT_TTL_SECONDS');
    const expiresAt = new Date(Date.now() + intentTtlSeconds * 1000);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const identities = manager.getRepository(UserIdentityEntity);
        const existingIdentity = await identities.findOne({
          where: { provider: IdentityProvider.GOOGLE, providerSubject: profile.subject },
        });
        if (existingIdentity !== null) {
          const user = await manager.getRepository(UserEntity).findOne({
            where: { id: existingIdentity.userId },
          });
          if (user === null || user.status !== UserStatus.ACTIVE) {
            throw new GoogleAuthenticationFailedException();
          }
          const tokens = await this.sessionService.create(
            manager,
            user,
            context,
            AuthenticationMethod.GOOGLE,
            existingIdentity.id,
          );
          return { kind: 'authenticated' as const, userId: user.id, tokens, returnTo };
        }

        const user = await manager.getRepository(UserEntity).findOne({
          where: { email: profile.email },
        });
        if (user?.status === UserStatus.SUSPENDED) {
          throw new GoogleAuthenticationFailedException();
        }
        if (user?.status === UserStatus.ACTIVE) {
          const identity = await identities.save(
            identities.create({
              userId: user.id,
              provider: IdentityProvider.GOOGLE,
              providerSubject: profile.subject,
              emailAtLink: profile.email,
              emailVerified: true,
              lastLoginAt: null,
            }),
          );
          const tokens = await this.sessionService.create(
            manager,
            user,
            context,
            AuthenticationMethod.GOOGLE,
            identity.id,
          );
          return { kind: 'authenticated' as const, userId: user.id, tokens, returnTo };
        }

        const intents = manager.getRepository(RegistrationIntentEntity);
        await intents.update(
          {
            provider: IdentityProvider.GOOGLE,
            providerSubject: profile.subject,
            consumedAt: IsNull(),
          },
          { consumedAt: new Date() },
        );
        await intents.save(
          intents.create({
            provider: IdentityProvider.GOOGLE,
            providerSubject: profile.subject,
            verifiedEmail: profile.email,
            displayNameHint: profile.displayName,
            avatarUrlHint: profile.avatarUrl,
            tokenHash: this.passwordService.hashRefreshToken(onboardingToken),
            returnTo,
            expiresAt,
            consumedAt: null,
          }),
        );
        return {
          kind: 'onboarding' as const,
          onboardingToken,
          maxAgeMilliseconds: intentTtlSeconds * 1000,
        };
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      throw new GoogleAuthenticationFailedException();
    }
  }

  async getRegistrationContext(rawToken: string): Promise<RegistrationIntentEntity> {
    const intent = await this.dataSource.getRepository(RegistrationIntentEntity).findOne({
      where: {
        tokenHash: this.passwordService.hashRefreshToken(rawToken),
        consumedAt: IsNull(),
      },
    });
    if (intent === null || intent.expiresAt.getTime() <= Date.now()) {
      throw new InvalidRegistrationIntentException();
    }
    return intent;
  }

  async completeGoogleRegistration(
    rawToken: string,
    input: CompleteGoogleRegistrationDto,
    context: AuthenticationContext,
  ): Promise<{ userId: string; tokens: AuthTokens; returnTo: string }> {
    const tokenHash = this.passwordService.hashRefreshToken(rawToken);
    const phone = normalizeOptionalPhone(input.phone);
    return this.dataSource.transaction(async (manager) => {
      const intent = await manager
        .getRepository(RegistrationIntentEntity)
        .createQueryBuilder('intent')
        .setLock('pessimistic_write')
        .where('intent.tokenHash = :tokenHash', { tokenHash })
        .getOne();
      const now = new Date();
      if (
        intent === null ||
        intent.consumedAt !== null ||
        intent.expiresAt.getTime() <= now.getTime()
      ) {
        throw new InvalidRegistrationIntentException();
      }

      const identities = manager.getRepository(UserIdentityEntity);
      if (
        await identities.exists({
          where: {
            provider: IdentityProvider.GOOGLE,
            providerSubject: intent.providerSubject,
          },
        })
      ) {
        throw new InvalidRegistrationIntentException();
      }

      const users = manager.getRepository(UserEntity);
      let user = await users
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .setLock('pessimistic_write')
        .where('user.email = :email', { email: intent.verifiedEmail })
        .getOne();
      if (user !== null && user.status !== UserStatus.PENDING_VERIFICATION) {
        throw new InvalidRegistrationIntentException();
      }
      if (
        phone !== null &&
        (await users
          .createQueryBuilder('user')
          .where('user.phone = :phone', { phone })
          .andWhere(user === null ? 'TRUE' : 'user.id != :userId', { userId: user?.id })
          .getExists())
      ) {
        throw new UserPhoneAlreadyExistsException();
      }

      if (user === null) {
        user = users.create({
          email: intent.verifiedEmail,
          phone,
          passwordHash: null,
          displayName: input.displayName.trim(),
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
          lastLoginAt: null,
        });
      } else {
        user.phone = phone;
        user.displayName = input.displayName.trim();
        user.passwordHash = null;
        user.status = UserStatus.ACTIVE;
      }
      user = await users.save(user);

      const identity = await identities.save(
        identities.create({
          userId: user.id,
          provider: IdentityProvider.GOOGLE,
          providerSubject: intent.providerSubject,
          emailAtLink: intent.verifiedEmail,
          emailVerified: true,
          lastLoginAt: null,
        }),
      );
      intent.consumedAt = now;
      await manager.getRepository(RegistrationIntentEntity).save(intent);
      await manager.update(
        EmailVerificationTokenEntity,
        { userId: user.id, usedAt: IsNull() },
        { usedAt: now },
      );
      const tokens = await this.sessionService.create(
        manager,
        user,
        context,
        AuthenticationMethod.GOOGLE,
        identity.id,
      );
      return { userId: user.id, tokens, returnTo: intent.returnTo };
    });
  }

  private emailVerificationExpiry(): Date {
    return new Date(
      Date.now() + this.config.getOrThrow<number>('EMAIL_VERIFICATION_TTL_SECONDS') * 1000,
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}
