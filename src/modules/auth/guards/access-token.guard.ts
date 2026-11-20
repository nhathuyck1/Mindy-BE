import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { AuthService } from '../auth.service.js';
import type { AuthenticatedUser } from '../auth.types.js';
import { AuthenticationRequiredException } from '../exceptions/auth.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TokenService } from '../services/token.service.js';

type RequestWithUser = {
  user?: AuthenticatedUser;
  cookies?: Record<string, string | undefined>;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.cookies?.access_token;
    if (token === undefined || token.length === 0) {
      throw new AuthenticationRequiredException();
    }

    try {
      request.user = this.tokenService.verifyAccessToken(token);
      await this.authService.assertAccessPrincipalValid(request.user);
      return true;
    } catch {
      throw new AuthenticationRequiredException();
    }
  }
}
