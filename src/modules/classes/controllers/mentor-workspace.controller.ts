import { Controller, Get, Header, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Nest requires runtime constructor metadata.
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import {
  StoredProgressPageDto,
  StoredProgressUnitPageDto,
} from '../../enrollments/dtos/stored-progress.dto.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Runtime validation metadata.
import {
  MentorProgressQueryDto,
  MentorWorkspaceDto,
  MentorWorkspaceQueryDto,
  MentorWorkspaceSessionPageDto,
} from '../dtos/mentor-workspace.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MentorProgressService } from '../services/mentor-progress.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MentorWorkspaceService } from '../services/mentor-workspace.service.js';

@ApiTags('mentor workspace')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(400, 401, 403, 404, 422)
@Controller('mentor/classes')
export class MentorWorkspaceController {
  constructor(
    private readonly workspace: MentorWorkspaceService,
    private readonly progress: MentorProgressService,
  ) {}
  @Get(':classId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Read assigned class shell and scoped counts; units have a separate paginated endpoint',
  })
  @ApiOkResponse({ type: MentorWorkspaceDto })
  detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<MentorWorkspaceDto> {
    return this.workspace.detail(actor, id);
  }
  @Get(':classId/sessions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Paginated authorized timetable; no implicit range or meeting links' })
  @ApiOkResponse({ type: MentorWorkspaceSessionPageDto })
  sessions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: MentorWorkspaceQueryDto,
  ): Promise<MentorWorkspaceSessionPageDto> {
    return this.workspace.sessions(actor, id, query);
  }

  @Get(':classId/progress')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Primary mentor reads stored tracking counts; completion policy is undefined',
  })
  @ApiOkResponse({ type: StoredProgressPageDto })
  progressSummary(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: MentorProgressQueryDto,
  ): Promise<StoredProgressPageDto> {
    return this.progress.summary(actor, id, query, query.unitId);
  }
  @Get(':classId/students/:studentId/progress')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Primary mentor reads paginated stored units per enrollment' })
  @ApiOkResponse({ type: StoredProgressUnitPageDto })
  studentProgress(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('studentId', new ParseUUIDPipe({ version: '4' })) studentId: string,
    @Query() query: PageOptionsDto,
  ): Promise<StoredProgressUnitPageDto> {
    return this.progress.units(actor, id, studentId, query);
  }
}
