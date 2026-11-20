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
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Runtime DTO metadata.
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { RequestOriginGuard } from '../../../common/guards/request-origin.guard.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { QuizResultDto } from '../dtos/assignment.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO metadata.
import { AssignmentQueryDto } from '../dtos/assignment-input.dto.js';
import {
  AssignmentDownloadDto,
  AssignmentExtensionDto,
  AssignmentFileStatusDto,
  AssignmentInstructionsDto,
  AssignmentMetricsDto,
  AssignmentRosterDto,
  AssignmentUploadDto,
  MentorZipSubmissionDto,
  StudentZipSubmissionDto,
  ZipGradeHistoryDto,
} from '../dtos/zip.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO metadata.
import {
  AssignmentUploadInput,
  ExtendAssignmentInput,
  InstructionFilesInput,
  InstructionUploadInput,
  SubmissionQuery,
  ZipDraftInput,
  ZipFileInput,
  ZipGradeInput,
  ZipReleaseInput,
  ZipVersionInput,
} from '../dtos/zip-input.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentFilesService } from '../services/assignment-files.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentHistoryService } from '../services/assignment-history.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ZipSubmissionsService } from '../services/zip-submissions.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });
const keyHeader = {
  name: 'Idempotency-Key',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const historySchema = (mentor = false) => ({
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        oneOf: [
          { $ref: getSchemaPath(mentor ? MentorZipSubmissionDto : StudentZipSubmissionDto) },
          {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['QUIZ'] },
              id: { type: 'string', format: 'uuid' },
              assignmentId: { type: 'string', format: 'uuid' },
              studentId: { type: 'string', format: 'uuid' },
              attemptNumber: { type: 'integer' },
              submittedAt: { type: 'string', format: 'date-time' },
              status: { type: 'string', enum: ['GRADED'] },
              result: { $ref: getSchemaPath(QuizResultDto) },
            },
          },
        ],
      },
    },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
  },
});

@ApiTags('assignments')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(400, 401, 403, 404, 409, 422, 429, 503)
@Controller('mentor')
export class MentorZipAssignmentsController {
  constructor(
    private readonly zip: ZipSubmissionsService,
    private readonly files: AssignmentFilesService,
    private readonly history: AssignmentHistoryService,
  ) {}
  @Post('assignments/:id/instruction-upload-intents')
  @ApiOperation({
    summary: 'Create a private instruction upload; DRAFT only, up to 25 MiB PDF/DOCX/PNG/JPEG',
  })
  @Header('Cache-Control', 'private, no-store')
  @ApiHeader(keyHeader)
  @ApiCreatedResponse({ type: AssignmentUploadDto })
  intent(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() input: InstructionUploadInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.files.intent(actor, id, input, true, key);
  }
  @Put('assignments/:id/instruction-files')
  @ApiOperation({
    summary: 'Replace up to five ordered READY instruction files owned by current mentor',
  })
  @Header('Cache-Control', 'private, no-store')
  @ApiHeader(keyHeader)
  @ApiOkResponse({ type: AssignmentInstructionsDto })
  instructions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() input: InstructionFilesInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.zip.replaceInstructions(actor, id, input, key);
  }
  @Post('assignments/:id/extend')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Increase published ZIP deadline/attempt limit with reason and revision protection',
  })
  @Header('Cache-Control', 'private, no-store')
  @ApiHeader(keyHeader)
  @ApiOkResponse({ type: AssignmentExtensionDto })
  extend(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() input: ExtendAssignmentInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.zip.extend(actor, id, input, key);
  }
  @Get('zip-submissions/:id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read scoped submitted ZIP and current/released grade versions' })
  @ApiOkResponse({ type: MentorZipSubmissionDto })
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', uuid) id: string) {
    return this.zip.get(actor, id);
  }
  @Put('zip-submissions/:id/grade')
  @ApiOperation({ summary: 'Save a new draft grade revision; corrections require reason' })
  @Header('Cache-Control', 'private, no-store')
  @ApiHeader(keyHeader)
  @ApiOkResponse({ type: MentorZipSubmissionDto })
  grade(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() input: ZipGradeInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.zip.grade(actor, id, input, key);
  }
  @Post('zip-submissions/:id/grade/release')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Release exactly the current grade revision with stale release protection',
  })
  @Header('Cache-Control', 'private, no-store')
  @ApiHeader(keyHeader)
  @ApiOkResponse({ type: MentorZipSubmissionDto })
  release(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() input: ZipReleaseInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.zip.release(actor, id, input, key);
  }
  @Get('zip-submissions/:id/grade/history')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read paginated immutable grade revisions in current mentor scope' })
  @ApiOkResponse({ type: ZipGradeHistoryDto })
  gradeHistory(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Query() query: PageOptionsDto,
  ) {
    return this.zip.gradeHistory(actor, id, query);
  }
  @Get('assignments/:id/submissions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Latest submitted attempt per student by default; history=true for older attempts',
  })
  @ApiExtraModels(MentorZipSubmissionDto, QuizResultDto)
  @ApiOkResponse({ schema: historySchema(true) })
  queue(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Query() query: SubmissionQuery,
  ) {
    return this.history.submissions(actor, id, query);
  }
  @Get('assignments/:id/roster')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Current eligible roster; missing only after deadline; no historical eligibility inference',
  })
  @ApiOkResponse({ type: AssignmentRosterDto })
  roster(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Query() query: SubmissionQuery,
  ) {
    return this.history.roster(actor, id, query);
  }
  @Get('classes/:id/assignment-metrics')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Scoped assignment/student-pair counts; terminal submitted history retained',
  })
  @ApiOkResponse({ type: AssignmentMetricsDto })
  metrics(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Query() query: AssignmentQueryDto,
  ) {
    return this.history.metrics(actor, id, query);
  }
}

@ApiTags('assignments')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.STUDENT)
@ApiErrors(400, 401, 403, 404, 409, 422, 429, 503)
@Controller('me')
export class StudentZipAssignmentsController {
  constructor(
    private readonly zip: ZipSubmissionsService,
    private readonly files: AssignmentFilesService,
    private readonly history: AssignmentHistoryService,
  ) {}
  @Post('assignments/:id/zip-submissions')
  @ApiOperation({ summary: 'Create or resume one open ZIP draft; only submit consumes an attempt' })
  @Header('Cache-Control', 'private, no-store')
  @ApiHeader(keyHeader)
  @ApiCreatedResponse({ type: StudentZipSubmissionDto })
  draft(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() input: ZipDraftInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.zip.draft(actor, id, input, key);
  }
  @Post('zip-submissions/:id/upload-intents')
  @ApiOperation({ summary: 'Create a ZIP upload bound to own open draft, <=20 MiB' })
  @Header('Cache-Control', 'private, no-store')
  @ApiHeader(keyHeader)
  @ApiCreatedResponse({ type: AssignmentUploadDto })
  intent(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() input: AssignmentUploadInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.files.intent(actor, id, input, false, key);
  }
  @Put('zip-submissions/:id/file')
  @ApiOperation({ summary: 'Attach exactly one own READY ZIP; replace only while DRAFT' })
  @Header('Cache-Control', 'private, no-store')
  @ApiHeader(keyHeader)
  @ApiOkResponse({ type: StudentZipSubmissionDto })
  attach(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() input: ZipFileInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.zip.attach(actor, id, input, key);
  }
  @Post('zip-submissions/:id/submit')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Submit immutable ZIP attempt before DB deadline; snapshot instructions and score limit',
  })
  @Header('Cache-Control', 'private, no-store')
  @ApiHeader(keyHeader)
  @ApiOkResponse({ type: StudentZipSubmissionDto })
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() input: ZipVersionInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.zip.submit(actor, id, input, key);
  }
  @Get('zip-submissions/:id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Own draft/history; only released grade is visible, including after enrollment termination',
  })
  @ApiOkResponse({ type: StudentZipSubmissionDto })
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', uuid) id: string) {
    return this.zip.get(actor, id);
  }
  @Get('assignments/:id/submissions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Own paginated QUIZ/ZIP submitted history, newest first; new drafts do not replace current result',
  })
  @ApiExtraModels(StudentZipSubmissionDto, QuizResultDto)
  @ApiOkResponse({ schema: historySchema() })
  historyList(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Query() query: SubmissionQuery,
  ) {
    return this.history.submissions(actor, id, query);
  }
}

@ApiTags('assignments')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.STUDENT, UserRole.MENTOR)
@ApiErrors(400, 401, 403, 404, 409, 422, 503)
@Controller('assignment-files')
export class AssignmentFilesController {
  constructor(private readonly files: AssignmentFilesService) {}
  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Pin staging version and queue durable validation; expectedVersion is FILE version',
  })
  @Header('Cache-Control', 'private, no-store')
  @ApiHeader(keyHeader)
  @ApiOkResponse({ type: AssignmentFileStatusDto })
  complete(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() input: ZipVersionInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.files.complete(actor, id, input, key);
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read authorized file state; READY does not submit an assignment' })
  @ApiOkResponse({ type: AssignmentFileStatusDto })
  status(@CurrentUser() actor: AuthenticatedUser, @Param('id', uuid) id: string) {
    return this.files.status(actor, id);
  }
  @Get(':id/download')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Authorize binding and issue 60-second private attachment URL; recheck after signing',
  })
  @ApiOkResponse({ type: AssignmentDownloadDto })
  download(@CurrentUser() actor: AuthenticatedUser, @Param('id', uuid) id: string) {
    return this.files.download(actor, id);
  }
}
