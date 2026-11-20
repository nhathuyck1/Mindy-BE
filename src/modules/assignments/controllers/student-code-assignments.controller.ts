import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCookieAuth,
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
import { CODE_LANGUAGE_KEYS, type CodeLanguageKey } from '../domain/code-signature.js';
// biome-ignore lint/style/useImportType: Runtime DTO validation metadata.
import { CodeRunInput, CodeSubmitInput, SaveCodeDraftInput } from '../dtos/code-input.dto.js';
import {
  CodeDraftDto,
  CodeRunResultDto,
  StudentCodeAssignmentDto,
  StudentCodeSubmissionDto,
  StudentCodeSubmissionListDto,
} from '../dtos/code-student.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { CodeSubmissionsService } from '../services/code-submissions.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });
const languageKey = new ParseEnumPipe(Object.fromEntries(CODE_LANGUAGE_KEYS.map((k) => [k, k])));

/** Phase 7 C3: student work on CODE assignments. Hidden tests and references are never projected. */
@ApiTags('assignments')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.STUDENT)
@ApiErrors(400, 401, 403, 404, 409, 422, 429, 503)
@Controller('me')
export class StudentCodeAssignmentsController {
  constructor(private readonly code: CodeSubmissionsService) {}

  @Get('assignments/:assignmentId/code')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'CODE problem, sample tests, starter code, attempts and best score' })
  @ApiOkResponse({ type: StudentCodeAssignmentDto })
  view(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
  ): Promise<StudentCodeAssignmentDto> {
    return this.code.view(actor, id);
  }

  @Get('assignments/:assignmentId/code-drafts/:languageKey')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Own saved draft, or the starter code with version 0' })
  @ApiOkResponse({ type: CodeDraftDto })
  draft(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Param('languageKey', languageKey) language: CodeLanguageKey,
  ): Promise<CodeDraftDto> {
    return this.code.draft(actor, id, language);
  }

  @Put('assignments/:assignmentId/code-drafts/:languageKey')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Autosave a draft with optimistic versioning (0 = first save)' })
  @ApiOkResponse({ type: CodeDraftDto })
  saveDraft(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Param('languageKey', languageKey) language: CodeLanguageKey,
    @Body() input: SaveCodeDraftInput,
  ): Promise<CodeDraftDto> {
    return this.code.saveDraft(actor, id, language, input);
  }

  @Post('assignments/:assignmentId/code-runs')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Run sample tests or one custom input; not stored, not graded, rate limited',
  })
  @ApiOkResponse({ type: CodeRunResultDto })
  run(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Body() input: CodeRunInput,
  ): Promise<CodeRunResultDto> {
    return this.code.run(actor, id, input);
  }

  @Post('assignments/:assignmentId/code-submissions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Submit for judging (202); retrying the same key returns the same submission (200)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiAcceptedResponse({ type: StudentCodeSubmissionDto })
  @ApiOkResponse({ type: StudentCodeSubmissionDto })
  async submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Body() input: CodeSubmitInput,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
    @Headers('idempotency-key') key?: string,
  ): Promise<StudentCodeSubmissionDto> {
    const result = await this.code.submit(actor, id, input, key);
    response.status(result.created ? 202 : 200);
    return result.submission;
  }

  @Get('assignments/:assignmentId/code-submissions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Own submission history, newest first' })
  @ApiOkResponse({ type: StudentCodeSubmissionListDto })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
  ): Promise<StudentCodeSubmissionListDto> {
    return this.code.list(actor, id);
  }

  @Get('code-submissions/:submissionId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Own submission detail; poll while QUEUED/RUNNING (retryAfterMs)' })
  @ApiOkResponse({ type: StudentCodeSubmissionDto })
  detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('submissionId', uuid) id: string,
  ): Promise<StudentCodeSubmissionDto> {
    return this.code.detail(actor, id);
  }
}
