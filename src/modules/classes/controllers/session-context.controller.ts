import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { TeachingSessionContextDto } from '../dtos/teaching.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingReadService } from '../services/teaching-read.service.js';

@ApiTags('class-session-context')
@Controller('class-sessions')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.MENTOR, UserRole.STUDENT)
@ApiCookieAuth('access_token')
@ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN, HttpStatus.NOT_FOUND)
export class SessionContextController {
  constructor(private readonly read: TeachingReadService) {}
  @Get(':sessionId/context')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read context scoped to the assigned teaching session' })
  @ApiOkResponse({ type: TeachingSessionContextDto })
  async get(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TeachingSessionContextDto> {
    return this.read.context(id, actor);
  }
}
