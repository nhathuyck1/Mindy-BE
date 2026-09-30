import type { UserRole } from '../users/user-role.enum.js';

export interface AuthenticatedUser {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: UserRole;
}

export interface AuthenticationContext {
  readonly deviceName: string | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshTokenExpiresAt: Date;
}
