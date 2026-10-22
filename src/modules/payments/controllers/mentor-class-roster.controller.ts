import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
// biome-ignore lint/style/useImportType: Nest requires runtime constructor metadata.
import { MentorWorkspaceService } from '../../classes/services/mentor-workspace.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest query validation needs runtime DTO metadata.
import {
  MentorClassDto,
  MentorClassPageDto,
  MentorClassPageOptionsDto,
  MentorRosterPageDto,
  MentorRosterPageOptionsDto,
  MentorRosterStudentDto,
} from '../dtos/mentor-class-roster.dto.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { MentorClassRosterService } from '../services/mentor-class-roster.service.js';

@ApiTags('mentor classes')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
@Controller('mentor/classes')
export class MentorClassRosterController {
  constructor(
    private readonly roster: MentorClassRosterService,
    private readonly workspace: MentorWorkspaceService,
    private readonly db: DataSource,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List classes currently assigned to the signed-in mentor' })
  @ApiOkResponse({ type: MentorClassPageDto })
  async classes(
    @CurrentUser() user: AuthenticatedUser,
    @Query() options: MentorClassPageOptionsDto,
  ): Promise<MentorClassPageDto> {
    await this.workspace.actor(this.db.manager, user);
    const result = await this.roster.classes(user.userId, options);
    return new MentorClassPageDto(
      result.items.map((view) => new MentorClassDto(view, view.assignmentType)),
      options.page,
      options.pageSize,
      result.total,
    );
  }

  @Get(':classId/students')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'List effective enrollments and payment status for an assigned class',
    description:
      'Payment status is read-only for mentors. Managers confirm cash using the full order total.',
  })
  @ApiOkResponse({ type: MentorRosterPageDto })
  async students(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Query() options: MentorRosterPageOptionsDto,
  ): Promise<MentorRosterPageDto> {
    await this.workspace.scope(this.db.manager, user, classId, true);
    const result = await this.roster.students(user.userId, classId, options);
    return new MentorRosterPageDto(
      result.items.map((row) => new MentorRosterStudentDto(row)),
      options.page,
      options.pageSize,
      result.total,
    );
  }
}
