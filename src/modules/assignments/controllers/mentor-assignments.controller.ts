import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequestOriginGuard } from '../../../common/guards/request-origin.guard.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { AssignmentDto, AssignmentPageDto } from '../dtos/assignment.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO validation metadata.
import {
  ArchiveAssignmentInput,
  AssignmentQueryDto,
  AssignmentRevisionInput,
  CreateAssignmentInput,
  ReplaceQuestionsInput,
  UpdateAssignmentInput,
} from '../dtos/assignment-input.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentsService } from '../services/assignments.service.js';

@ApiTags('assignments')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(400, 401, 403, 404, 409, 422)
@Controller('mentor')
export class MentorAssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}
  @Post('class-sessions/:sessionId/assignments')
  @ApiOperation({ summary: 'Create a session assignment draft' })
  @ApiCreatedResponse({ type: AssignmentDto })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: CreateAssignmentInput,
  ): Promise<AssignmentDto> {
    return this.assignments.create(actor, id, input);
  }
  @Get('class-sessions/:sessionId/assignments')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List assignments in an authorized session' })
  @ApiOkResponse({ type: AssignmentPageDto })
  sessionList(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: AssignmentQueryDto,
  ): Promise<AssignmentPageDto> {
    return this.assignments.list(actor, null, id, query);
  }
  @Get('classes/:classId/assignments')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List class assignments, scoped to primary or substitute sessions' })
  @ApiOkResponse({ type: AssignmentPageDto })
  classList(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: AssignmentQueryDto,
  ): Promise<AssignmentPageDto> {
    return this.assignments.list(actor, id, null, query);
  }
  @Get('assignments/:assignmentId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read assignment authoring detail including private quiz keys' })
  @ApiOkResponse({ type: AssignmentDto })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<AssignmentDto> {
    return this.assignments.get(actor, id);
  }
  @Patch('assignments/:assignmentId')
  @ApiOperation({ summary: 'Edit draft metadata with revision protection' })
  @ApiOkResponse({ type: AssignmentDto })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateAssignmentInput,
  ): Promise<AssignmentDto> {
    return this.assignments.update(actor, id, input);
  }
  @Put('assignments/:assignmentId/questions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Atomically replace draft ABCD questions and private keys' })
  @ApiOkResponse({ type: AssignmentDto })
  questions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ReplaceQuestionsInput,
  ): Promise<AssignmentDto> {
    return this.assignments.replaceQuestions(actor, id, input);
  }
  @Post('assignments/:assignmentId/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish and freeze a complete quiz; ZIP publication is deferred' })
  @ApiOkResponse({ type: AssignmentDto })
  publish(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: AssignmentRevisionInput,
  ): Promise<AssignmentDto> {
    return this.assignments.publish(actor, id, input.expectedRevision);
  }
  @Post('assignments/:assignmentId/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive a published assignment and void active attempts' })
  @ApiOkResponse({ type: AssignmentDto })
  archive(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ArchiveAssignmentInput,
  ): Promise<AssignmentDto> {
    return this.assignments.archive(actor, id, input);
  }
  @Delete('assignments/:assignmentId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft delete an unpublished draft' })
  @ApiNoContentResponse()
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: AssignmentRevisionInput,
  ): Promise<void> {
    return this.assignments.remove(actor, id, input.expectedRevision);
  }
}
