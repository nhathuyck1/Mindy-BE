import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource } from 'typeorm';
import { inReadSnapshot } from '../../../common/database/read-snapshot.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import {
  AttendanceProjectionService,
  type AttendanceTimetableEvent,
  type TimetableQuery,
} from '../../attendance/services/attendance-projection.service.js';
import { SessionAssignmentRequiredException } from '../../classes/exceptions/teaching.exceptions.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import { ScheduleClassAccessDeniedException } from '../exceptions/student-learning.exceptions.js';

export type ScheduleQuery = TimetableQuery;
export type ScheduleEvent = AttendanceTimetableEvent;
export interface SchedulePage {
  readonly items: ScheduleEvent[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly timeZone: string;
  readonly from: Date;
  readonly to: Date;
  readonly asOf: Date;
}
/** Composes current timetable access and Attendance's public, count-once projection. */
@Injectable()
export class MyScheduleService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly projections: AttendanceProjectionService,
    private readonly users: UsersService,
  ) {}

  async list(studentId: string, query: ScheduleQuery, now = new Date()): Promise<SchedulePage> {
    return inReadSnapshot(this.dataSource, async (m) => {
      if (!(await this.users.findActiveByRole(studentId, UserRole.STUDENT, m)))
        throw new SessionAssignmentRequiredException();
      if (
        query.classId !== undefined &&
        !(await this.projections.canViewScheduleClass(m, studentId, query.classId, now))
      )
        throw new ScheduleClassAccessDeniedException();
      const result = await this.projections.timetable(m, studentId, query, now);
      return {
        ...result,
        page: query.page,
        pageSize: query.pageSize,
        timeZone: this.config.getOrThrow<string>('APP_TIME_ZONE'),
        from: query.from,
        to: query.to,
        asOf: now,
      };
    });
  }
}
