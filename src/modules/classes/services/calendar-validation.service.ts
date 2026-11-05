import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { approvedLeaveOverlap } from '../../mentor-availability/mentor-availability.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ScheduleReservationsService } from '../../schedule-reservations/schedule-reservations.service.js';
import type { CalendarConflictDto } from '../dtos/weekly-schedule.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MentorConflictService } from './mentor-conflict.service.js';

export interface CalendarTarget {
  sessionId: string;
  classId: string;
  mentorId: string;
  startsAt: Date;
  endsAt: Date;
}

@Injectable()
export class CalendarValidationService {
  constructor(
    private readonly mentors: MentorConflictService,
    private readonly reservations: ScheduleReservationsService,
  ) {}
  async lock(m: EntityManager, classId: string, mentorIds: readonly string[]): Promise<void> {
    await this.mentors.lockClassMentors(m, [classId], mentorIds);
    await this.reservations.lockStudents(m, await this.reservations.classStudentIds(m, classId));
  }
  async conflicts(
    m: EntityManager,
    targets: readonly CalendarTarget[],
  ): Promise<CalendarConflictDto[]> {
    if (!targets.length) return [];
    return m.query(
      `WITH targets AS (
      SELECT * FROM jsonb_to_recordset($2::jsonb) AS t("sessionId" uuid,"classId" uuid,"mentorId" uuid,"startsAt" timestamptz,"endsAt" timestamptz)),
      collisions AS (
      SELECT t."sessionId",s.id AS "conflictingSessionId",s.starts_at AS "startsAt",s.ends_at AS "endsAt",
        CASE WHEN c.id=t."classId" THEN 'CLASS' WHEN (CASE WHEN s.status='SCHEDULED' THEN coalesce(s.mentor_override_id,c.mentor_id) ELSE coalesce(s.teaching_mentor_id,c.mentor_id) END)=t."mentorId" THEN 'MENTOR' ELSE 'STUDENT' END AS kind
      FROM targets t JOIN class_sessions s ON s.starts_at<t."endsAt" AND s.ends_at>t."startsAt"
      JOIN class_units u ON u.id=s.class_unit_id JOIN classes c ON c.id=u.class_id
      WHERE s.id<>ALL($3::uuid[]) AND s.status IN ('SCHEDULED','IN_PROGRESS') AND c.status IN ('OPEN','IN_PROGRESS') AND (
        c.id=t."classId" OR (CASE WHEN s.status='SCHEDULED' THEN coalesce(s.mentor_override_id,c.mentor_id) ELSE coalesce(s.teaching_mentor_id,c.mentor_id) END)=t."mentorId" OR
        EXISTS(SELECT 1 FROM enrollments a WHERE a.class_id=t."classId" AND (a.status='ACTIVE' OR (a.status='PENDING_PAYMENT' AND EXISTS(SELECT 1 FROM order_details ad JOIN orders ao ON ao.id=ad.order_id WHERE ad.id=a.order_detail_id AND ao.payment_type='CASH' AND ao.status='PENDING' AND ao.expires_at>$1))) AND (
          EXISTS(SELECT 1 FROM enrollments e WHERE e.class_id=c.id AND e.student_id=a.student_id AND (e.status='ACTIVE' OR (e.status='PENDING_PAYMENT' AND EXISTS(SELECT 1 FROM order_details d JOIN orders o ON o.id=d.order_id WHERE d.id=e.order_detail_id AND o.payment_type='CASH' AND o.status='PENDING' AND o.expires_at>$1)))) OR
          EXISTS(SELECT 1 FROM makeup_placements p WHERE p.student_id=a.student_id AND p.target_session_id=s.id AND p.status='ASSIGNED'))))
      UNION ALL SELECT t."sessionId",o."sessionId",o."startsAt",o."endsAt",'CLASS' FROM targets t JOIN targets o ON t."sessionId"<>o."sessionId" AND t."startsAt"<o."endsAt" AND t."endsAt">o."startsAt"
      UNION ALL SELECT t."sessionId",NULL::uuid,t."startsAt",t."endsAt",'APPROVED_LEAVE' FROM targets t WHERE ${approvedLeaveOverlap('t."mentorId"', 't."startsAt"', 't."endsAt"')})
      SELECT DISTINCT * FROM collisions ORDER BY "sessionId","startsAt","conflictingSessionId" LIMIT 100`,
      [new Date(), JSON.stringify(targets), targets.map((t) => t.sessionId)],
    );
  }
}
