import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import {
  ClassMentorAssignmentDto,
  ClassMentorCandidatesDto,
  SessionMentorCandidatesDto,
  TeachingClassDetailDto,
  TeachingClassPageDto,
  TeachingSessionDto,
} from '../dtos/teaching.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import {
  AssignClassMentorDto,
  AssignSessionMentorDto,
  ManagementClassesQueryDto,
  MentorCandidatesQueryDto,
} from '../dtos/teaching-query.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingAssignmentService } from '../services/teaching-assignment.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingReadService } from '../services/teaching-read.service.js';

@ApiTags('teaching-management')
@Controller('management')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiCookieAuth('access_token')
@ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
export class TeachingManagementController {
  constructor(
    private readonly read: TeachingReadService,
    private readonly assignments: TeachingAssignmentService,
  ) {}

  @Get('classes')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List classes for teaching management' })
  @ApiOkResponse({ type: TeachingClassPageDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async list(@Query() q: ManagementClassesQueryDto): Promise<TeachingClassPageDto> {
    return this.read.listClasses(q);
  }

  @Get('classes/:classId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read a class and its paginated timetable' })
  @ApiOkResponse({ type: TeachingClassDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async detail(
    @Param('classId', new ParseUUIDPipe()) id: string,
    @Query() q: PageOptionsDto,
  ): Promise<TeachingClassDetailDto> {
    return this.read.classDetail(id, q);
  }

  @Get('classes/:classId/available-mentors')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Find active mentors available for affected class sessions' })
  @ApiOkResponse({ type: ClassMentorCandidatesDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async classCandidates(
    @Param('classId', new ParseUUIDPipe()) id: string,
    @Query() q: MentorCandidatesQueryDto,
  ): Promise<ClassMentorCandidatesDto> {
    return this.read.classCandidates(id, q);
  }

  @Get('class-sessions/:sessionId/available-mentors')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Find active mentors available for this session' })
  @ApiOkResponse({ type: SessionMentorCandidatesDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async sessionCandidates(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @Query() q: MentorCandidatesQueryDto,
  ): Promise<SessionMentorCandidatesDto> {
    return this.read.sessionCandidates(id, q);
  }

  @Patch('classes/:classId/mentor')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Assign the primary mentor; preserve session overrides' })
  @ApiOkResponse({ type: ClassMentorAssignmentDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  async assignClass(
    @Param('classId', new ParseUUIDPipe()) id: string,
    @Body() input: AssignClassMentorDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<ClassMentorAssignmentDto> {
    return this.assignments.assignClass(id, input, actor, key);
  }

  @Patch('class-sessions/:sessionId/mentor')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Assign or clear the substitute mentor of a session' })
  @ApiOkResponse({ type: TeachingSessionDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  async assignSession(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @Body() input: AssignSessionMentorDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<TeachingSessionDto> {
    return this.assignments.assignSession(id, input, actor, key);
  }
}
