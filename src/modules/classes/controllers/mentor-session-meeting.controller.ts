import { Body, Controller, Header, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestOriginGuard } from '../../../common/guards/request-origin.guard.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Runtime request validation metadata.
import { SessionMeetingDto, UpdateSessionMeetingDto } from '../dtos/session-meeting.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { SessionMeetingService } from '../services/session-meeting.service.js';

@ApiTags('mentor workspace')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(400, 401, 403, 404, 409, 422)
@Controller('mentor/class-sessions')
export class MentorSessionMeetingController {
  constructor(private readonly meetings: SessionMeetingService) {}

  @Patch(':sessionId/meeting-url')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Assigned teaching mentor updates the session meeting URL' })
  @ApiOkResponse({ type: SessionMeetingDto })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateSessionMeetingDto,
  ): Promise<SessionMeetingDto> {
    return this.meetings.update(id, actor, input);
  }
}
