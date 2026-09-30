import { SetMetadata } from '@nestjs/common';

import type { UserRole } from '../../users/user-role.enum.js';

export const ROLES_METADATA_KEY = 'auth:roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_METADATA_KEY, roles);
