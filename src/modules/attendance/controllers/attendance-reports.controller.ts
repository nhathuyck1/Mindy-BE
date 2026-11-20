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
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import {
  AttendanceHistoryPageDto,
  AttendanceSummaryDto,
  ClassAttendanceSummaryPageDto,
  IncompleteSessionPageDto,
} from '../dtos/attendance-report.dto.js';
// biome-ignore lint/style/useImportType: Nest query validation needs runtime DTO metadata.
import {
  AttendanceRangeDto,
  AttendanceReportQueryDto,
  IncompleteSessionsQueryDto,
} from '../dtos/attendance-report-query.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { AttendanceReportsService } from '../services/attendance-reports.service.js';

@ApiTags('student attendance')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@ApiErrors(
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
@Controller('me/classes')
export class StudentAttendanceReportsController {
  constructor(private readonly reports: AttendanceReportsService) {}

  @Get(':classId/attendance')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Own physical attendance history, including terminal enrollment; metadata only',
  })
  @ApiOkResponse({ type: AttendanceHistoryPageDto })
  history(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AttendanceReportQueryDto,
  ): Promise<AttendanceHistoryPageDto> {
    return this.reports.history(classId, actor, query);
  }

  @Get(':classId/attendance-summary')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Own finalized source attendance credit, once per root obligation; optional paired range',
  })
  @ApiOkResponse({ type: AttendanceSummaryDto })
  summary(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AttendanceRangeDto,
  ): Promise<AttendanceSummaryDto> {
    return this.reports.ownSummary(classId, actor, query);
  }
}

@ApiTags('attendance-management')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiErrors(
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
@Controller('management')
export class ManagementAttendanceReportsController {
  constructor(private readonly reports: AttendanceReportsService) {}

  @Get('class-sessions/incomplete')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'All unresolved overdue sessions by default; no implicit weekly range or writes',
  })
  @ApiOkResponse({ type: IncompleteSessionPageDto })
  incomplete(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: IncompleteSessionsQueryDto,
  ): Promise<IncompleteSessionPageDto> {
    return this.reports.incomplete(actor, query);
  }

  @Get('classes/:classId/attendance-summary')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Per-enrollment attendance credit using the same source formula as Student summary',
  })
  @ApiOkResponse({ type: ClassAttendanceSummaryPageDto })
  summary(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AttendanceReportQueryDto,
  ): Promise<ClassAttendanceSummaryPageDto> {
    return this.reports.classSummary(classId, actor, query);
  }
}
