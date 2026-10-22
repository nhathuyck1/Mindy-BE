import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Nest validation requires runtime DTO metadata.
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import {
  AttendanceCandidatePageDto,
  AttendanceRosterDto,
  AttendanceWriteDto,
} from '../dtos/attendance.dto.js';
// biome-ignore lint/style/useImportType: Nest validation requires runtime DTO metadata.
import {
  AttendanceMutationDto,
  BulkMarkAttendanceDto,
  FinalizeSessionDto,
  MarkAttendanceDto,
  StartSessionDto,
} from '../dtos/attendance-input.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { AttendanceService } from '../services/attendance.service.js';

@ApiTags('attendance')
@Controller('class-sessions')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.MENTOR)
@ApiCookieAuth('access_token')
@ApiErrors(
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.CONFLICT,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get(':sessionId/attendance-candidates')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read provisional paid regular/eligible guest roster before start; no writes',
  })
  @ApiOkResponse({ type: AttendanceCandidatePageDto })
  candidates(
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() page: PageOptionsDto,
  ): Promise<AttendanceCandidatePageDto> {
    return this.attendance.candidates(id, actor, page);
  }

  @Get(':sessionId/attendance')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read a paginated attendance snapshot and whole-roster totals' })
  @ApiOkResponse({ type: AttendanceRosterDto })
  roster(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() page: PageOptionsDto,
  ): Promise<AttendanceRosterDto> {
    return this.attendance.roster(id, actor, page);
  }

  @Post(':sessionId/start')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Open attendance and snapshot active enrollments; staff may recover an overdue start',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ type: AttendanceWriteDto })
  start(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @Body() input: StartSessionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.attendance.start(id, input, actor, key);
  }

  @Post(':sessionId/attendance/sync-roster')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Admit eligible enrollments after committed cash activation' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ type: AttendanceWriteDto })
  sync(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @Body() input: AttendanceMutationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.attendance.syncRoster(id, input, actor, key);
  }

  @Put(':sessionId/attendance')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Mark snapshot records or correct closed attendance; closed results require PRESENT/ABSENT',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ type: AttendanceWriteDto })
  mark(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @Body() input: MarkAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.attendance.mark(id, input, actor, key);
  }

  @Put(':sessionId/attendance/bulk')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Mark the entire regular and guest roster across all pages: checked = present, unchecked = absent',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ type: AttendanceWriteDto })
  bulkMark(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @Body() input: BulkMarkAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.attendance.bulkMark(id, input, actor, key);
  }

  @Post(':sessionId/finalize')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Finalize attendance, converting unmarked snapshot records to absent' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ type: AttendanceWriteDto })
  finalize(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @Body() input: FinalizeSessionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.attendance.finalize(id, input, actor, key);
  }
}
