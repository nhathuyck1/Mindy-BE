import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  isSingleTeachingDay,
  localDateAtTime,
  toLocalDate,
} from '../../classes/domain/class-calendar.js';
import type { ClassEntity } from '../../classes/entities/class.entity.js';
import type { ClassSessionEntity } from '../../classes/entities/class-session.entity.js';
import { approvedLeaveOverlap } from '../../mentor-availability/mentor-availability.service.js';
import { TIMETABLE_ENROLLMENT_SQL } from '../../schedule-reservations/schedule-reservations.service.js';
import { type LeavePeriod, leaveDays, periodInterval } from '../domain/leave-calendar.js';
import type {
  CreateLeaveInput,
  LeavePreviewInput,
  LeaveStudentConflictDto,
} from '../dtos/leave.dto.js';
import { LeaveException } from '../exceptions/leave.exceptions.js';

export interface LeaveSource {
  readonly classId: string;
  readonly session: ClassSessionEntity;
}
export interface LeaveTarget {
  readonly sourceSessionId: string;
  readonly classId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly replacementSessionId?: string | null;
}
export interface StudentConflictPreview {
  readonly total: number;
  readonly items: LeaveStudentConflictDto[];
}

@Injectable()
export class LeavePlanningService {
  async availableSlots(
    m: EntityManager,
    mentorId: string,
    source: ClassSessionEntity,
    c: ClassEntity,
    period: { startsAt: Date; endsAt: Date },
    now: Date,
    zone: string,
  ): Promise<{ startsAt: Date; endsAt: Date }[]> {
    if (toLocalDate(period.startsAt, zone) < c.startDate) return [];
    return m.query(
      `WITH slots AS (
      SELECT start AS "startsAt",start+($4::timestamptz-$3::timestamptz) AS "endsAt"
      FROM generate_series($5::timestamptz,$6::timestamptz-($4::timestamptz-$3::timestamptz),interval '15 minutes') start),
      members AS (SELECT e.student_id FROM enrollments e WHERE e.class_id=$7 AND ${TIMETABLE_ENROLLMENT_SQL})
      SELECT t.* FROM slots t WHERE t."startsAt">$1
      AND NOT ${approvedLeaveOverlap('$2', 't."startsAt"', 't."endsAt"')}
      AND NOT EXISTS(SELECT 1 FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id JOIN classes c ON c.id=u.class_id
        WHERE s.id<>$8 AND s.status IN ('SCHEDULED','IN_PROGRESS') AND c.status IN ('OPEN','IN_PROGRESS')
          AND s.starts_at<t."endsAt" AND s.ends_at>t."startsAt" AND (
            c.id=$7 OR CASE WHEN s.status='SCHEDULED' THEN coalesce(s.mentor_override_id,c.mentor_id)
              ELSE coalesce(s.teaching_mentor_id,c.mentor_id) END=$2 OR
            EXISTS(SELECT 1 FROM enrollments e JOIN members a ON a.student_id=e.student_id WHERE e.class_id=c.id AND ${TIMETABLE_ENROLLMENT_SQL}) OR
            EXISTS(SELECT 1 FROM makeup_placements p JOIN members a ON a.student_id=p.student_id WHERE p.target_session_id=s.id AND p.status='ASSIGNED')))
      ORDER BY t."startsAt"`,
      [
        now,
        mentorId,
        source.startsAt,
        source.endsAt,
        period.startsAt,
        period.endsAt,
        c.id,
        source.id,
      ],
    );
  }
  intervals(input: LeavePreviewInput, zone: string): { startsAt: Date; endsAt: Date }[] {
    return leaveDays(input.fromDate, input.toDate).map((d) =>
      periodInterval(d, input.period, zone),
    );
  }

  mappings(input: CreateLeaveInput, sources: readonly LeaveSource[], zone: string): LeaveTarget[] {
    const full = input.period === 'FULL_DAY';
    const dates = [...new Set(sources.map((s) => toLocalDate(s.session.startsAt, zone)))];
    if (
      full
        ? input.sessionMappings !== undefined || input.dayMappings?.length !== dates.length
        : input.dayMappings !== undefined || input.sessionMappings?.length !== sources.length
    )
      throw new LeaveException(
        'LEAVE_MAPPING_INVALID',
        'Map every affected source exactly once using the period mapping',
        422,
      );
    if (
      full &&
      (new Set(input.dayMappings?.map((d) => d.sourceDate)).size !== dates.length ||
        input.dayMappings?.some((d) => !dates.includes(d.sourceDate)))
    )
      throw new LeaveException(
        'LEAVE_MAPPING_INVALID',
        'Day mappings must match affected dates',
        422,
      );
    if (
      !full &&
      (new Set(input.sessionMappings?.map((d) => d.sourceSessionId)).size !== sources.length ||
        input.sessionMappings?.some(
          (d) => !sources.some((s) => s.session.id === d.sourceSessionId),
        ))
    )
      throw new LeaveException(
        'LEAVE_MAPPING_INVALID',
        'Session mappings must match affected sessions',
        422,
      );
    return sources.map(({ session: s, classId }) => {
      if (full) {
        const mapping = input.dayMappings?.find(
          (d) => d.sourceDate === toLocalDate(s.startsAt, zone),
        );
        if (!mapping) throw new LeaveException('LEAVE_MAPPING_INVALID', 'Missing source date', 422);
        leaveDays(mapping.targetDate, mapping.targetDate);
        const parts = new Intl.DateTimeFormat('sv-SE', {
          timeZone: zone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(s.startsAt);
        const startsAt = localDateAtTime(mapping.targetDate, parts, zone);
        if (!startsAt)
          throw new LeaveException('LEAVE_MAPPING_INVALID', 'Invalid local clock', 422);
        // Preserve seconds/milliseconds too, including existing imported sessions.
        startsAt.setTime(
          startsAt.getTime() + s.startsAt.getUTCSeconds() * 1000 + s.startsAt.getUTCMilliseconds(),
        );
        return {
          sourceSessionId: s.id,
          classId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + s.endsAt.getTime() - s.startsAt.getTime()),
        };
      }
      const mapping = input.sessionMappings?.find((d) => d.sourceSessionId === s.id);
      if (!mapping)
        throw new LeaveException('LEAVE_MAPPING_INVALID', 'Missing source session', 422);
      const { startsAt: from, endsAt: to } = periodInterval(
        mapping.targetDate,
        mapping.targetPeriod,
        zone,
      );
      const startsAt = new Date(mapping.startsAt),
        endsAt = new Date(mapping.endsAt);
      if (
        startsAt < from ||
        endsAt > to ||
        startsAt >= endsAt ||
        endsAt.getTime() - startsAt.getTime() !== s.endsAt.getTime() - s.startsAt.getTime()
      )
        throw new LeaveException(
          'LEAVE_MAPPING_INVALID',
          'Keep duration and fit the target period',
          422,
        );
      return { sourceSessionId: s.id, classId, startsAt, endsAt };
    });
  }

  async validate(
    m: EntityManager,
    mentorId: string,
    period: LeavePeriod,
    targets: readonly LeaveTarget[],
    classes: ReadonlyMap<string, ClassEntity>,
    intervals: readonly { startsAt: Date; endsAt: Date }[],
    zone: string,
    now: Date,
  ): Promise<StudentConflictPreview> {
    for (const t of targets) {
      const c = classes.get(t.classId);
      if (
        !c ||
        t.startsAt <= now ||
        !isSingleTeachingDay(t.startsAt, t.endsAt, zone) ||
        toLocalDate(t.startsAt, zone) < c.startDate
      )
        throw new LeaveException(
          'LEAVE_TARGET_INVALID',
          'Target must be future, within one teaching day and after class start',
          422,
        );
      if (intervals.some((i) => i.startsAt < t.endsAt && i.endsAt > t.startsAt))
        throw new LeaveException('LEAVE_TARGET_CONFLICT', 'Makeup overlaps the requested leave');
    }
    const data = JSON.stringify(targets);
    const conflicts: unknown[] = await m.query(
      `WITH targets AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS t("sourceSessionId" uuid,"classId" uuid,"startsAt" timestamptz,"endsAt" timestamptz))
      SELECT 1 FROM targets t WHERE
      ${approvedLeaveOverlap('$2', 't."startsAt"', 't."endsAt"')} OR
      EXISTS(SELECT 1 FROM targets other WHERE other."sourceSessionId"<>t."sourceSessionId"
        AND other."startsAt"<t."endsAt" AND other."endsAt">t."startsAt") OR
      EXISTS(SELECT 1 FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id JOIN classes c ON c.id=u.class_id
        WHERE s.id<>ALL($3::uuid[]) AND s.status IN ('SCHEDULED','IN_PROGRESS') AND c.status IN ('OPEN','IN_PROGRESS')
        AND s.starts_at<t."endsAt" AND s.ends_at>t."startsAt" AND
        (c.id=t."classId" OR CASE WHEN s.status='SCHEDULED' THEN coalesce(s.mentor_override_id,c.mentor_id)
          ELSE coalesce(s.teaching_mentor_id,c.mentor_id) END=$2)) LIMIT 1`,
      [data, mentorId, targets.map((t) => t.sourceSessionId)],
    );
    if (conflicts.length)
      throw new LeaveException(
        'LEAVE_TARGET_CONFLICT',
        'Makeup overlaps a mentor, class or approved leave interval',
      );
    const students = await this.studentConflicts(m, targets, now);
    if (period !== 'FULL_DAY' && students.total)
      throw new LeaveException(
        'LEAVE_STUDENT_CONFLICT',
        'Partial-day makeup cannot overlap student timetables',
      );
    return students;
  }

  async studentConflicts(
    m: EntityManager,
    targets: readonly LeaveTarget[],
    now: Date,
    query?: { page: number; pageSize: number },
  ): Promise<StudentConflictPreview> {
    if (!targets.length) return { total: 0, items: [] };
    const cte = `WITH targets AS (
      SELECT * FROM jsonb_to_recordset($2::jsonb) AS t("sourceSessionId" uuid,"classId" uuid,"startsAt" timestamptz,"endsAt" timestamptz)),
      members AS (SELECT t.*,e.student_id FROM targets t JOIN enrollments e ON e.class_id=t."classId" WHERE ${TIMETABLE_ENROLLMENT_SQL}),
      collisions AS (
        SELECT a."sourceSessionId",a.student_id AS "studentId",s.id AS "conflictingSessionId"
        FROM members a JOIN class_sessions s ON s.starts_at<a."endsAt" AND s.ends_at>a."startsAt"
        JOIN class_units u ON u.id=s.class_unit_id JOIN classes c ON c.id=u.class_id
        WHERE s.id<>ALL($3::uuid[]) AND s.status IN ('SCHEDULED','IN_PROGRESS') AND c.status IN ('OPEN','IN_PROGRESS') AND
          (EXISTS(SELECT 1 FROM enrollments e WHERE e.class_id=c.id AND e.student_id=a.student_id AND ${TIMETABLE_ENROLLMENT_SQL}) OR
           EXISTS(SELECT 1 FROM makeup_placements p WHERE p.target_session_id=s.id AND p.student_id=a.student_id AND p.status='ASSIGNED'))
        UNION SELECT a."sourceSessionId",a.student_id,b."sourceSessionId" FROM members a JOIN members b
          ON a.student_id=b.student_id AND a."sourceSessionId"<>b."sourceSessionId"
          AND a."startsAt"<b."endsAt" AND a."endsAt">b."startsAt")
      SELECT DISTINCT * FROM collisions`;
    const params = [
      now,
      JSON.stringify(targets),
      targets.flatMap((t) =>
        t.replacementSessionId ? [t.sourceSessionId, t.replacementSessionId] : [t.sourceSessionId],
      ),
    ];
    const counts: { total: string }[] = await m.query(
      `SELECT count(*) AS total FROM (${cte}) conflicts`,
      params,
    );
    const items: LeaveStudentConflictDto[] = query
      ? await m.query(
          `${cte} ORDER BY "sourceSessionId","studentId","conflictingSessionId" LIMIT $4 OFFSET $5`,
          [...params, query.pageSize, (query.page - 1) * query.pageSize],
        )
      : [];
    return { total: Number(counts[0]?.total ?? 0), items };
  }
}
