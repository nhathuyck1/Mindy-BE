import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
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
import {
  QuizAttemptDto,
  StudentAssignmentDto,
  StudentAssignmentPageDto,
} from '../dtos/assignment.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO validation metadata.
import {
  AssignmentQueryDto,
  SaveAnswersInput,
  StartQuizInput,
} from '../dtos/assignment-input.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentsService } from '../services/assignments.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { QuizAttemptsService } from '../services/quiz-attempts.service.js';

@ApiTags('assignments')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.STUDENT)
@ApiErrors(400, 401, 403, 404, 409, 422)
@Controller('me')
export class StudentAssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly attempts: QuizAttemptsService,
  ) {}
  @Get('classes/:classId/assignments')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List published assignments for an active enrollment' })
  @ApiOkResponse({ type: StudentAssignmentPageDto })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: AssignmentQueryDto,
  ): Promise<StudentAssignmentPageDto> {
    return this.assignments.list(actor, id, null, query);
  }
  @Get('assignments/:assignmentId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read assignment instructions; no quiz questions or keys before start' })
  @ApiOkResponse({ type: StudentAssignmentDto })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<StudentAssignmentDto> {
    return this.assignments.get(actor, id);
  }
  @Post('assignments/:assignmentId/start')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Start once or resume the same quiz without resetting its clock' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiCreatedResponse({ type: QuizAttemptDto })
  @ApiOkResponse({ type: QuizAttemptDto })
  async start(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: StartQuizInput,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
    @Headers('idempotency-key') key?: string,
  ): Promise<QuizAttemptDto> {
    const result = await this.attempts.start(actor, id, input.expectedAssignmentRevision, key);
    response.status(result.created ? 201 : 200);
    return result.attempt;
  }
  @Get('assignment-submissions/:submissionId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Reload own saved answers, frozen questions and server clock' })
  @ApiOkResponse({ type: QuizAttemptDto })
  attempt(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('submissionId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<QuizAttemptDto> {
    return this.attempts.get(actor, id);
  }
  @Put('assignment-submissions/:submissionId/answers')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Save the full selected-answer set without grading' })
  @ApiOkResponse({ type: QuizAttemptDto })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  answers(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('submissionId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: SaveAnswersInput,
    @Headers('idempotency-key') key?: string,
  ): Promise<QuizAttemptDto> {
    return this.attempts.save(actor, id, input, key);
  }
  @Post('assignment-submissions/:submissionId/submit')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Submit all answers once; atomically grade and release the result' })
  @ApiOkResponse({ type: QuizAttemptDto })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('submissionId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: SaveAnswersInput,
    @Headers('idempotency-key') key?: string,
  ): Promise<QuizAttemptDto> {
    return this.attempts.save(actor, id, input, key, true);
  }
  @Get('assignment-submissions/:submissionId/result')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read a durable released quiz result; FINALIZING requests may poll' })
  @ApiOkResponse({ type: QuizAttemptDto })
  result(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('submissionId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<QuizAttemptDto> {
    return this.attempts.get(actor, id, true);
  }
}
