import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import type { ClassSessionEntity } from '../../classes/entities/class-session.entity.js';
import type { GuestAttendanceMarkDto } from '../dtos/attendance-input.dto.js';
import { AttendanceStatus } from '../enums/attendance-status.enum.js';
import { MakeupConflictException } from '../exceptions/makeup.exceptions.js';

type GuestRow = { id: string; placement_id: string; status: AttendanceStatus };

/** Participates in the AttendanceService transaction and shares its locked Session version. */
@Injectable()
export class GuestAttendanceService {
  async admit(
    m: EntityManager,
    s: ClassSessionEntity,
    actor: AuthenticatedUser,
    reason?: string,
    version = s.version,
  ): Promise<string[]> {
    if (s.status !== 'IN_PROGRESS') return [];
    const rows: GuestRow[] = await m.query(
      `INSERT INTO guest_attendance_records(placement_id,session_id,enrollment_id,student_id,admitted_at,recorded_by)
      SELECT p.id,p.target_session_id,p.enrollment_id,p.student_id,$2,$3 FROM makeup_placements p
      JOIN enrollments e ON e.id=p.enrollment_id JOIN classes c ON c.id=p.source_class_id
      WHERE p.target_session_id=$1 AND p.status='ASSIGNED' AND e.status='ACTIVE'
        AND e.enrolled_at<=$4 AND p.created_at<=$4 AND c.status IN ('OPEN','IN_PROGRESS')
      ON CONFLICT(placement_id) DO NOTHING RETURNING id,placement_id,status`,
      [s.id, new Date(), actor.userId, s.actualStartedAt],
    );
    for (const row of rows) await this.audit(m, row, actor.userId, null, reason, 'ADMIT', version);
    return rows.map((r) => r.placement_id);
  }

  async mark(
    m: EntityManager,
    s: ClassSessionEntity,
    input: readonly GuestAttendanceMarkDto[],
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<string[]> {
    const ids = input.map((r) => r.makeupPlacementId);
    if (!ids.length) return [];
    if (
      new Set(ids).size !== ids.length ||
      (s.status !== 'IN_PROGRESS' && input.some((r) => r.status === AttendanceStatus.UNMARKED))
    )
      throw new UnprocessableEntityException(
        'Guest records must be unique; closed sessions require PRESENT or ABSENT',
      );
    const rows: GuestRow[] = await m.query(
      `SELECT g.id,g.placement_id,g.status FROM guest_attendance_records g
      WHERE g.session_id=$1 AND g.placement_id=ANY($2::uuid[])`,
      [s.id, ids],
    );
    if (rows.length !== ids.length)
      throw new MakeupConflictException(
        'MAKEUP_ATTENDANCE_NOT_ELIGIBLE',
        'Guest is not in this session roster',
      );
    const changed: string[] = [];
    for (const row of rows) {
      const next = input.find((r) => r.makeupPlacementId === row.placement_id)?.status;
      if (!next || next === row.status) continue;
      const old = row.status;
      row.status = next;
      await m.query(
        'UPDATE guest_attendance_records SET status=$2,checked_in_at=$3,recorded_by=$4,updated_at=now() WHERE id=$1',
        [row.id, next, next === AttendanceStatus.PRESENT ? new Date() : null, actor.userId],
      );
      await this.audit(
        m,
        row,
        actor.userId,
        old,
        reason,
        s.status === 'IN_PROGRESS' ? 'MARK' : 'CORRECT',
        s.version + 1,
      );
      changed.push(row.placement_id);
    }
    return changed;
  }

  async finalize(
    m: EntityManager,
    s: ClassSessionEntity,
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<string[]> {
    const rows: GuestRow[] = await m.query(
      `WITH changed AS (UPDATE guest_attendance_records g SET status='ABSENT',checked_in_at=NULL,recorded_by=$2,updated_at=now()
      FROM makeup_placements p WHERE g.placement_id=p.id AND g.session_id=$1 AND g.status='UNMARKED'
        AND p.status='ASSIGNED' RETURNING g.id,g.placement_id,g.status) SELECT * FROM changed`,
      [s.id, actor.userId],
    );
    for (const row of rows)
      await this.audit(
        m,
        row,
        actor.userId,
        AttendanceStatus.UNMARKED,
        reason,
        'FINALIZE',
        s.version,
      );
    const completed: { id: string; conflict_id: string; version: number }[] = await m.query(
      `WITH changed AS (UPDATE makeup_placements p SET status='COMPLETED',version=version+1,updated_at=now()
      WHERE p.target_session_id=$1 AND p.status='ASSIGNED' AND EXISTS(SELECT 1 FROM guest_attendance_records g WHERE g.placement_id=p.id)
      RETURNING p.id,p.conflict_id,p.version) SELECT * FROM changed`,
      [s.id],
    );
    for (const p of completed) {
      await m.query(
        `INSERT INTO makeup_placement_audits(placement_id,actor_id,old_status,new_status,reason,version)
        VALUES($1,$2,'ASSIGNED','COMPLETED',$3,$4)`,
        [p.id, actor.userId, reason ?? 'Target attendance finalized', p.version],
      );
      await m.query(
        "UPDATE student_schedule_conflicts SET status='RESOLVED',version=version+1,updated_at=now() WHERE id=$1",
        [p.conflict_id],
      );
    }
    // Never invent ABSENT for placements without an eligible snapshot.
    const pending: { id: string; conflict_id: string; version: number }[] = await m.query(
      `WITH changed AS (UPDATE makeup_placements SET status='NEEDS_REASSIGNMENT',version=version+1,updated_at=now()
      WHERE target_session_id=$1 AND status='ASSIGNED' RETURNING id,conflict_id,version) SELECT * FROM changed`,
      [s.id],
    );
    for (const p of pending) {
      await m.query(
        `INSERT INTO makeup_placement_audits(placement_id,actor_id,old_status,new_status,reason,version)
        VALUES($1,$2,'ASSIGNED','NEEDS_REASSIGNMENT','No eligible guest snapshot at target finalization',$3)`,
        [p.id, actor.userId, p.version],
      );
      await m.query(
        "UPDATE student_schedule_conflicts SET status='OPEN',version=version+1,updated_at=now() WHERE id=$1",
        [p.conflict_id],
      );
    }
    return [
      ...new Set([
        ...rows.map((r) => r.placement_id),
        ...completed.map((p) => p.id),
        ...pending.map((p) => p.id),
      ]),
    ];
  }

  private async audit(
    m: EntityManager,
    row: GuestRow,
    actor: string,
    old: AttendanceStatus | null,
    reason: string | undefined,
    action: string,
    version: number,
  ): Promise<void> {
    await m.query(
      `INSERT INTO guest_attendance_audits(attendance_id,actor_id,old_status,new_status,reason,action,version)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [row.id, actor, old, row.status, reason ?? null, action, version],
    );
  }
}
