import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../auth.types.js';
import { ROLES_METADATA_KEY } from '../decorators/roles.decorator.js';
import { InsufficientRoleException } from '../exceptions/auth.exceptions.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<readonly string[]>(ROLES_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles === undefined || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (request.user === undefined || !requiredRoles.includes(request.user.role)) {
      throw new InsufficientRoleException();
    }

    return true;
  }
}
