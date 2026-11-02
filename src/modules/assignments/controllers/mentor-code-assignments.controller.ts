import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestOriginGuard } from '../../../common/guards/request-origin.guard.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { CODE_LANGUAGE_KEYS, type CodeLanguageKey } from '../domain/code-signature.js';
import { AssignmentDto } from '../dtos/assignment.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO validation metadata.
import { AssignmentRevisionInput } from '../dtos/assignment-input.dto.js';
import {
  CodeGenerateResultDto,
  CodeLanguageDto,
  CodeLibraryPageDto,
  CodeStarterPreviewDto,
  CodeValidationResultDto,
  MentorCodeAuthoringDto,
} from '../dtos/code.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO validation metadata.
import {
  CodeLibraryQueryDto,
  CodeReviewQueryDto,
  CodeSignaturePreviewInput,
  ExtendCodeAssignmentInput,
  GenerateCodeOutputsInput,
  ImportCodeProblemInput,
  ReplaceCodeLanguagesInput,
  ReplaceCodeTestsInput,
  UpsertCodeProblemInput,
  UpsertCodeReferenceInput,
  UpsertCodeTestInput,
  VoidCodeSubmissionInput,
} from '../dtos/code-input.dto.js';
import {
  CodeSummaryDto,
  MentorCodeSubmissionDetailDto,
  MentorCodeSubmissionDto,
  MentorCodeSubmissionPageDto,
} from '../dtos/code-review.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { CodeAuthoringService } from '../services/code-authoring.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { CodeReviewService } from '../services/code-review.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });
const languageKey = new ParseEnumPipe(Object.fromEntries(CODE_LANGUAGE_KEYS.map((k) => [k, k])));

/** Phase 7 C2 + C4: mentor authoring and review of LeetCode-style CODE assignments. */
@ApiTags('assignments')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(400, 401, 403, 404, 409, 422, 429, 503)
@Controller('mentor')
export class MentorCodeAssignmentsController {
  constructor(
    private readonly code: CodeAuthoringService,
    private readonly review: CodeReviewService,
  ) {}

  @Get('code-languages')
  @ApiOperation({ summary: 'Languages enabled for CODE assignments' })
  @ApiOkResponse({ type: [CodeLanguageDto] })
  languages(): Promise<CodeLanguageDto[]> {
    return this.code.languages();
  }

  @Post('code-signatures/preview')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Generate JavaScript/Java starter code from a function signature (not saved)',
  })
  @ApiOkResponse({ type: CodeStarterPreviewDto })
  preview(@Body() input: CodeSignaturePreviewInput): CodeStarterPreviewDto {
    return this.code.preview(input);
  }

  @Get('code-library')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'CODE assignments authored by this mentor, newest first (reuse as a template)',
  })
  @ApiOkResponse({ type: CodeLibraryPageDto })
  library(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: CodeLibraryQueryDto,
  ): Promise<CodeLibraryPageDto> {
    return this.code.library(actor, query);
  }

  @Get('assignments/:assignmentId/code')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'CODE authoring detail including hidden tests and reference solutions' })
  @ApiOkResponse({ type: MentorCodeAuthoringDto })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
  ): Promise<MentorCodeAuthoringDto> {
    return this.code.get(actor, id);
  }

  @Put('assignments/:assignmentId/code-problem')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Create or update the draft statement, signature, comparison, scoring and limits',
  })
  @ApiOkResponse({ type: MentorCodeAuthoringDto })
  problem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Body() input: UpsertCodeProblemInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.code.upsertProblem(actor, id, input);
  }

  @Put('assignments/:assignmentId/code-languages')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Replace allowed languages and starter code (generated when omitted)' })
  @ApiOkResponse({ type: MentorCodeAuthoringDto })
  replaceLanguages(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Body() input: ReplaceCodeLanguagesInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.code.replaceLanguages(actor, id, input);
  }

  @Post('assignments/:assignmentId/code-import')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Copy problem, languages, tests and reference solutions from another CODE assignment into this draft',
  })
  @ApiOkResponse({ type: MentorCodeAuthoringDto })
  importProblem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Body() input: ImportCodeProblemInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.code.importProblem(actor, id, input);
  }

  @Post('assignments/:assignmentId/code-tests/generate')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Run the reference solution on inputs and return its outputs as expected values (nothing saved)',
  })
  @ApiOkResponse({ type: CodeGenerateResultDto })
  generate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Body() input: GenerateCodeOutputsInput,
  ): Promise<CodeGenerateResultDto> {
    return this.code.generateOutputs(actor, id, input);
  }

  @Put('assignments/:assignmentId/code-tests')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Replace all draft tests in one revision (1..30, positions follow array order)',
  })
  @ApiOkResponse({ type: MentorCodeAuthoringDto })
  replaceTests(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Body() input: ReplaceCodeTestsInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.code.replaceTests(actor, id, input);
  }

  @Put('assignments/:assignmentId/code-tests/:position')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create or replace one draft test (position 1..30)' })
  @ApiOkResponse({ type: MentorCodeAuthoringDto })
  upsertTest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Param('position', ParseIntPipe) position: number,
    @Body() input: UpsertCodeTestInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.code.upsertTest(actor, id, position, input);
  }

  @Delete('assignments/:assignmentId/code-tests/:position')
  @ApiOperation({ summary: 'Delete one draft test' })
  @ApiOkResponse({ type: MentorCodeAuthoringDto })
  deleteTest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Param('position', ParseIntPipe) position: number,
    @Body() input: AssignmentRevisionInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.code.deleteTest(actor, id, position, input.expectedRevision);
  }

  @Put('assignments/:assignmentId/code-reference/:languageKey')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Save the reference solution for one allowed language' })
  @ApiOkResponse({ type: MentorCodeAuthoringDto })
  reference(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Param('languageKey', languageKey) language: CodeLanguageKey,
    @Body() input: UpsertCodeReferenceInput,
  ): Promise<MentorCodeAuthoringDto> {
    return this.code.upsertReference(actor, id, language, input);
  }

  @Post('assignments/:assignmentId/code-validate')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Run reference solutions on every test; all must pass before publish' })
  @ApiOkResponse({ type: CodeValidationResultDto })
  validate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Body() input: AssignmentRevisionInput,
  ): Promise<CodeValidationResultDto> {
    return this.code.validate(actor, id, input.expectedRevision);
  }

  @Post('assignments/:assignmentId/code-extension')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Published CODE: extend the deadline and/or increase attempts, with a reason',
  })
  @ApiOkResponse({ type: AssignmentDto })
  extend(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Body() input: ExtendCodeAssignmentInput,
  ): Promise<AssignmentDto> {
    return this.code.extend(actor, id, input);
  }

  @Get('assignments/:assignmentId/code-summary')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Students × best score, attempts and latest verdict, with class totals',
  })
  @ApiOkResponse({ type: CodeSummaryDto })
  summary(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Query() query: CodeReviewQueryDto,
  ): Promise<CodeSummaryDto> {
    return this.review.summary(actor, id, query);
  }

  @Get('assignments/:assignmentId/code-submissions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'All submissions of the assignment, newest first (filter by studentId)',
  })
  @ApiOkResponse({ type: MentorCodeSubmissionPageDto })
  submissions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('assignmentId', uuid) id: string,
    @Query() query: CodeReviewQueryDto,
  ): Promise<MentorCodeSubmissionPageDto> {
    return this.review.submissions(actor, id, query);
  }

  @Get('code-submissions/:submissionId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Submission source and every test (hidden inputs/expected included)' })
  @ApiOkResponse({ type: MentorCodeSubmissionDetailDto })
  submission(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('submissionId', uuid) id: string,
  ): Promise<MentorCodeSubmissionDetailDto> {
    return this.review.submission(actor, id);
  }

  @Post('code-submissions/:submissionId/rejudge')
  @HttpCode(200)
  @ApiOperation({ summary: 'Re-queue a FAILED (infrastructure) submission' })
  @ApiOkResponse({ type: MentorCodeSubmissionDto })
  rejudge(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('submissionId', uuid) id: string,
  ): Promise<MentorCodeSubmissionDto> {
    return this.review.rejudge(actor, id);
  }

  @Post('code-submissions/:submissionId/void')
  @HttpCode(200)
  @ApiOperation({ summary: 'Void a submission with a reason (still counts as an attempt)' })
  @ApiOkResponse({ type: MentorCodeSubmissionDto })
  voidSubmission(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('submissionId', uuid) id: string,
    @Body() input: VoidCodeSubmissionInput,
  ): Promise<MentorCodeSubmissionDto> {
    return this.review.void(actor, id, input.reason);
  }
}
