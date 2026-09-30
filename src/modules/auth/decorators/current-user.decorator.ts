import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth.types.js';

type RequestWithUser = { user?: AuthenticatedUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.user === undefined) {
      throw new Error('CurrentUser decorator requires AccessTokenGuard');
    }

    return request.user;
  },
);
