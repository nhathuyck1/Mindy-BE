import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { SessionAssignmentRequiredException } from '../../classes/exceptions/teaching.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingReadService } from '../../classes/services/teaching-read.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import type { AttendanceAuditDto, AttendanceAuditPageDto } from '../dtos/attendance-audit.dto.js';
import type { AttendanceAuditQueryDto } from '../dtos/attendance-input.dto.js';
import { AttendanceEnrollmentNotEligibleException } from '../exceptions/attendance.exceptions.js';

@Injectable()
export class AttendanceAuditService {
  constructor(
    private readonly db: DataSource,
    private readonly teaching: TeachingReadService,
    private readonly users: UsersService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async list(
    id: string,
    actor: AuthenticatedUser,
    query: AttendanceAuditQueryDto,
  ): Promise<AttendanceAuditPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      if (
        ![UserRole.ADMIN, UserRole.MANAGER].includes(actor.role) ||
        !(await this.users.findActiveByRole(actor.userId, actor.role, m))
      )
        throw new SessionAssignmentRequiredException();
      const ctx = await this.teaching.loadSession(m, id);
      if (query.enrollmentId) {
        const [e] = await this.enrollments.attendanceHistory(m, [query.enrollmentId]);
        const guest: unknown[] = await m.query(
          'SELECT 1 FROM guest_attendance_records WHERE session_id=$1 AND enrollment_id=$2 LIMIT 1',
          [id, query.enrollmentId],
        );
        if (!e || (e.classId !== ctx.classEntity.id && !guest.length))
          throw new AttendanceEnrollmentNotEligibleException();
      }
      if (
        query.makeupPlacementId &&
        !(
          await m.query(
            'SELECT 1 FROM guest_attendance_records WHERE session_id=$1 AND placement_id=$2',
            [id, query.makeupPlacementId],
          )
        ).length
      )
        throw new AttendanceEnrollmentNotEligibleException();
      const cte = `WITH records AS (
        SELECT r.id,r.session_id,r.enrollment_id,NULL::uuid AS placement_id,'REGULAR' AS entry_type FROM attendance_records r
        UNION ALL SELECT g.id,g.session_id,g.enrollment_id,g.placement_id,'MAKEUP' FROM guest_attendance_records g),
        audits AS (SELECT * FROM attendance_audits UNION ALL SELECT * FROM guest_attendance_audits)`;
      const filter =
        'r.session_id=$1 AND ($2::uuid IS NULL OR r.enrollment_id=$2) AND ($3::uuid IS NULL OR r.placement_id=$3)';
      const counts: { count: string }[] = await m.query(
        `${cte} SELECT count(*) FROM audits a
        JOIN records r ON r.id=a.attendance_id WHERE ${filter}`,
        [id, query.enrollmentId ?? null, query.makeupPlacementId ?? null],
      );
      const rows: (Omit<AttendanceAuditDto, 'actor'> & { actorId: string })[] = await m.query(
        `${cte}
        SELECT a.id, a.attendance_id AS "attendanceId", r.enrollment_id AS "enrollmentId",
          r.entry_type AS "entryType",r.placement_id AS "makeupPlacementId",
          a.actor_id AS "actorId", a.old_status AS "oldStatus", a.new_status AS "newStatus",
          a.reason, a.occurred_at AS "occurredAt", a.action, a.version,
          h.id AS "recoveryAuditId", CASE WHEN h.id IS NULL THEN NULL ELSE jsonb_build_object(
            'evidenceNote',h.evidence_note, 'admissionBasis',i.admission_basis, 'paidAt',i.paid_at,
            'oldSessionStatus',h.old_status, 'newSessionStatus',h.new_status,
            'oldActualStartedAt',h.old_actual_started_at, 'newActualStartedAt',h.new_actual_started_at,
            'oldActualEndedAt',h.old_actual_ended_at, 'newActualEndedAt',h.new_actual_ended_at
          ) END AS "recoveryEvidence"
        FROM audits a JOIN records r ON r.id=a.attendance_id
        LEFT JOIN attendance_recovery_audit_items i ON i.attendance_id=r.id AND a.action='RECOVER'
        LEFT JOIN attendance_recovery_audits h ON h.id=i.recovery_audit_id AND h.version=a.version
        WHERE ${filter} ORDER BY a.occurred_at DESC,a.id DESC LIMIT $4 OFFSET $5`,
        [
          id,
          query.enrollmentId ?? null,
          query.makeupPlacementId ?? null,
          query.pageSize,
          (query.page - 1) * query.pageSize,
        ],
      );
      const names = new Map(
        (await this.users.findByIds([...new Set(rows.map((r) => r.actorId))], m)).map((u) => [
          u.id,
          u.displayName,
        ]),
      );
      return {
        items: rows.map(({ actorId, ...row }) => ({
          ...row,
          actor: { id: actorId, displayName: names.get(actorId) ?? null },
        })),
        page: query.page,
        pageSize: query.pageSize,
        total: Number(counts[0]?.count ?? 0),
      };
    });
  }
}
