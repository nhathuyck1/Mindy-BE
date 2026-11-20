import { Injectable, UnprocessableEntityException } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import { inReadSnapshot } from '../../../common/database/read-snapshot.js';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MentorWorkspaceService } from '../../classes/services/mentor-workspace.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TeachingReadService } from '../../classes/services/teaching-read.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import { attendanceSummary } from '../domain/attendance-credit.js';
import type {
  AttendanceRangeDto,
  AttendanceReportQueryDto,
} from '../dtos/attendance-report-query.dto.js';
import type {
  MentorAttendanceHistoryPageDto,
  MentorAttendanceSummaryDto,
  MentorClassAttendanceSummaryPageDto,
} from '../dtos/mentor-attendance-report.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import {
  AttendanceProjectionService,
  type AttendanceRange,
} from './attendance-projection.service.js';

function range(q: AttendanceRangeDto): AttendanceRange {
  if (q.from === undefined && q.to === undefined) return {};
  const from = new Date(q.from ?? ''),
    to = new Date(q.to ?? '');
  if (!(from < to) || to.getTime() - from.getTime() > 93 * 86400000)
    throw new UnprocessableEntityException('Range must be paired, positive and at most 93 days');
  return { from, to };
}
@Injectable()
export class MentorAttendanceReportsService {
  constructor(
    private readonly db: DataSource,
    private readonly workspace: MentorWorkspaceService,
    private readonly projections: AttendanceProjectionService,
    private readonly enrollments: EnrollmentsService,
    private readonly teaching: TeachingReadService,
  ) {}

  async classSummary(
    actor: AuthenticatedUser,
    classId: string,
    query: AttendanceReportQueryDto,
  ): Promise<MentorClassAttendanceSummaryPageDto> {
    const dates = range(query);
    return inReadSnapshot(this.db, async (m) => {
      const scope = await this.workspace.scope(m, actor, classId, true);
      const result = await this.projections.classSummary(m, classId, dates, query);
      return {
        classId,
        readonly: scope.readonly,
        ...result,
        items: result.items.map(({ enrollmentId, student, ...counts }) => ({
          enrollmentId,
          student,
          ...attendanceSummary(counts),
        })),
        page: query.page,
        pageSize: query.pageSize,
        asOf: new Date(),
        timeZone: this.teaching.timeZone(),
      };
    });
  }
  async history(
    actor: AuthenticatedUser,
    classId: string,
    studentId: string,
    query: AttendanceReportQueryDto,
  ): Promise<MentorAttendanceHistoryPageDto> {
    const dates = range(query);
    return inReadSnapshot(this.db, async (m) => {
      const scope = await this.workspace.scope(m, actor, classId, true);
      if (!(await this.enrollments.hasOwnHistory(m, classId, studentId)))
        throw new AppHttpException(404, 'CLASS_STUDENT_NOT_FOUND', 'Class student not found');
      return {
        classId,
        readonly: scope.readonly,
        ...(await this.projections.history(m, classId, studentId, dates, query)),
        page: query.page,
        pageSize: query.pageSize,
        asOf: new Date(),
        timeZone: this.teaching.timeZone(),
      };
    });
  }
  async summary(
    actor: AuthenticatedUser,
    classId: string,
    studentId: string,
    query: AttendanceRangeDto,
  ): Promise<MentorAttendanceSummaryDto> {
    const dates = range(query);
    return inReadSnapshot(this.db, async (m) => {
      const scope = await this.workspace.scope(m, actor, classId, true);
      if (!(await this.enrollments.hasOwnHistory(m, classId, studentId)))
        throw new AppHttpException(404, 'CLASS_STUDENT_NOT_FOUND', 'Class student not found');
      return {
        classId,
        readonly: scope.readonly,
        aggregationScope: 'STUDENT_CLASS_HISTORY',
        ...attendanceSummary(await this.projections.summary(m, classId, studentId, dates)),
        asOf: new Date(),
        timeZone: this.teaching.timeZone(),
      };
    });
  }
}
