import { Injectable, UnprocessableEntityException } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager } from 'typeorm';
import { inReadSnapshot } from '../../../common/database/read-snapshot.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { SessionAssignmentRequiredException } from '../../classes/exceptions/teaching.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingReadService } from '../../classes/services/teaching-read.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import { attendanceSummary } from '../domain/attendance-credit.js';
import type {
  AttendanceHistoryPageDto,
  AttendanceSummaryDto,
  ClassAttendanceSummaryPageDto,
  IncompleteSessionPageDto,
} from '../dtos/attendance-report.dto.js';
import type {
  AttendanceRangeDto,
  AttendanceReportQueryDto,
  IncompleteSessionsQueryDto,
} from '../dtos/attendance-report-query.dto.js';
import { AttendanceHistoryNotFoundException } from '../exceptions/attendance.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import {
  AttendanceProjectionService,
  type AttendanceRange,
} from './attendance-projection.service.js';

function checkedRange(query: AttendanceRangeDto): AttendanceRange {
  if (query.from === undefined && query.to === undefined) return {};
  const from = new Date(query.from ?? ''),
    to = new Date(query.to ?? '');
  if (!(from < to) || to.getTime() - from.getTime() > 93 * 86400000)
    throw new UnprocessableEntityException('from/to must be paired, positive and at most 93 days');
  return { from, to };
}

@Injectable()
export class AttendanceReportsService {
  constructor(
    private readonly db: DataSource,
    private readonly projections: AttendanceProjectionService,
    private readonly teaching: TeachingReadService,
    private readonly enrollments: EnrollmentsService,
    private readonly users: UsersService,
  ) {}

  async history(
    classId: string,
    actor: AuthenticatedUser,
    query: AttendanceReportQueryDto,
    now = new Date(),
  ): Promise<AttendanceHistoryPageDto> {
    const range = checkedRange(query);
    return inReadSnapshot(this.db, async (m) => {
      await this.own(m, classId, actor);
      return {
        classId,
        ...(await this.projections.history(m, classId, actor.userId, range, query)),
        page: query.page,
        pageSize: query.pageSize,
        asOf: now,
        timeZone: this.teaching.timeZone(),
      };
    });
  }

  async ownSummary(
    classId: string,
    actor: AuthenticatedUser,
    query: AttendanceRangeDto,
    now = new Date(),
  ): Promise<AttendanceSummaryDto> {
    const range = checkedRange(query);
    return inReadSnapshot(this.db, async (m) => {
      await this.own(m, classId, actor);
      return {
        classId,
        ...attendanceSummary(await this.projections.summary(m, classId, actor.userId, range)),
        asOf: now,
        timeZone: this.teaching.timeZone(),
      };
    });
  }

  async classSummary(
    classId: string,
    actor: AuthenticatedUser,
    query: AttendanceReportQueryDto,
    now = new Date(),
  ): Promise<ClassAttendanceSummaryPageDto> {
    const range = checkedRange(query);
    return inReadSnapshot(this.db, async (m) => {
      await this.staff(m, actor);
      await this.teaching.loadClass(m, classId);
      const result = await this.projections.classSummary(m, classId, range, query);
      return {
        classId,
        total: result.total,
        items: result.items.map(({ enrollmentId, student, ...counts }) => ({
          enrollmentId,
          student,
          ...attendanceSummary(counts),
        })),
        page: query.page,
        pageSize: query.pageSize,
        asOf: now,
        timeZone: this.teaching.timeZone(),
      };
    });
  }

  async incomplete(
    actor: AuthenticatedUser,
    query: IncompleteSessionsQueryDto,
    now = new Date(),
  ): Promise<IncompleteSessionPageDto> {
    const range = checkedRange(query);
    return inReadSnapshot(this.db, async (m) => {
      await this.staff(m, actor);
      const result = await this.teaching.incompleteSessions(
        m,
        {
          page: query.page,
          pageSize: query.pageSize,
          ...range,
          ...(query.classId === undefined ? {} : { classId: query.classId }),
          ...(query.issue === undefined ? {} : { issue: query.issue }),
        },
        now,
      );
      return {
        total: result.total,
        items: result.items.map((session) => ({
          session,
          issue: session.status === 'SCHEDULED' ? 'OVERDUE_NOT_STARTED' : 'STARTED_NOT_FINALIZED',
          deadlineExpired: session.editableUntil ? session.editableUntil <= now : null,
        })),
        page: query.page,
        pageSize: query.pageSize,
        asOf: now,
        timeZone: this.teaching.timeZone(),
      };
    });
  }

  private async own(m: EntityManager, classId: string, actor: AuthenticatedUser): Promise<void> {
    if (
      actor.role !== UserRole.STUDENT ||
      !(await this.users.findActiveByRole(actor.userId, UserRole.STUDENT, m))
    )
      throw new SessionAssignmentRequiredException();
    if (!(await this.enrollments.hasOwnHistory(m, classId, actor.userId)))
      throw new AttendanceHistoryNotFoundException();
  }
  private async staff(m: EntityManager, actor: AuthenticatedUser): Promise<void> {
    if (
      ![UserRole.ADMIN, UserRole.MANAGER].includes(actor.role) ||
      !(await this.users.findActiveByRole(actor.userId, actor.role, m))
    )
      throw new SessionAssignmentRequiredException();
  }
}
