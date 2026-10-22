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
// biome-ignore lint/style/useImportType: Nest query validation needs runtime DTO metadata.
import {
  AttendanceRangeDto,
  AttendanceReportQueryDto,
} from '../dtos/attendance-report-query.dto.js';
import {
  MentorAttendanceHistoryPageDto,
  MentorAttendanceSummaryDto,
  MentorClassAttendanceSummaryPageDto,
} from '../dtos/mentor-attendance-report.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { MentorAttendanceReportsService } from '../services/mentor-attendance-reports.service.js';

@ApiTags('mentor attendance')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
@Controller('mentor/classes')
export class MentorAttendanceReportsController {
  constructor(private readonly reports: MentorAttendanceReportsService) {}

  @Get(':classId/students/:studentId/attendance')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Primary mentor reads student attendance history',
  })
  @ApiOkResponse({ type: MentorAttendanceHistoryPageDto })
  history(
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('studentId', new ParseUUIDPipe({ version: '4' })) studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AttendanceReportQueryDto,
  ): Promise<MentorAttendanceHistoryPageDto> {
    return this.reports.history(actor, classId, studentId, query);
  }

  @Get(':classId/students/:studentId/attendance-summary')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Primary mentor reads student attendance credit using the shared formula',
  })
  @ApiOkResponse({ type: MentorAttendanceSummaryDto })
  summary(
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('studentId', new ParseUUIDPipe({ version: '4' })) studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AttendanceRangeDto,
  ): Promise<MentorAttendanceSummaryDto> {
    return this.reports.summary(actor, classId, studentId, query);
  }

  @Get(':classId/attendance-summary')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Primary mentor reads per-enrollment attendance credit' })
  @ApiOkResponse({ type: MentorClassAttendanceSummaryPageDto })
  classSummary(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: AttendanceReportQueryDto,
  ): Promise<MentorClassAttendanceSummaryPageDto> {
    return this.reports.classSummary(actor, id, query);
  }
}
