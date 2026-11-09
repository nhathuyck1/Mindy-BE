import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import { ClassEntity } from '../entities/class.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { TeachingConflictException } from '../exceptions/teaching.exceptions.js';

export interface ClassStartEligibility {
  minStudents: number;
  activeStudentCount: number;
  scheduledStartAt: Date | null;
  startEligibility: 'NOT_OPEN' | 'NO_SCHEDULE' | 'TOO_EARLY' | 'RESCHEDULE_REQUIRED' | 'ELIGIBLE';
  startIneligibilityReason: string | null;
}

export async function readClassStartEligibility(
  m: EntityManager,
  c: ClassEntity,
): Promise<ClassStartEligibility> {
  const result = await readClassStartEligibilities(m, [c]);
  const eligibility = result.get(c.id);
  if (!eligibility) throw new Error('Class opening projection missing');
  return eligibility;
}
export async function readClassStartEligibilities(
  m: EntityManager,
  classes: readonly ClassEntity[],
): Promise<Map<string, ClassStartEligibility>> {
  if (!classes.length) return new Map();
  const rows: {
    classId: string;
    scheduledStartAt: Date | null;
    activeStudentCount: number;
    cutoffCount: number;
    blocked: boolean;
    now: Date;
  }[] = await m.query(
    `
    WITH first_session AS (SELECT c.id AS class_id,min(s.starts_at) FILTER(WHERE s.status<>'CANCELLED') AS at
      FROM classes c LEFT JOIN class_units u ON u.class_id=c.id LEFT JOIN class_sessions s ON s.class_unit_id=u.id
      WHERE c.id=ANY($1::uuid[]) GROUP BY c.id),
    paid AS (SELECT e.id,e.class_id,e.student_id,e.enrolled_at,e.status,o.paid_at FROM enrollments e
      JOIN order_details d ON d.id=e.order_detail_id JOIN orders o ON o.id=d.order_id
      WHERE e.class_id=ANY($1::uuid[]) AND o.status='PAID')
    SELECT f.class_id AS "classId",f.at AS "scheduledStartAt",clock_timestamp() AS now,
      (SELECT count(DISTINCT student_id)::int FROM paid p WHERE p.class_id=f.class_id AND status='ACTIVE') AS "activeStudentCount",
      (SELECT count(DISTINCT student_id)::int FROM paid p WHERE p.class_id=f.class_id AND paid_at<=f.at AND enrolled_at<=f.at
        AND (SELECT h.status FROM class_opening_enrollment_events h WHERE h.enrollment_id=p.id AND h.effective_at<=f.at ORDER BY h.effective_at DESC,h.id DESC LIMIT 1)='ACTIVE') AS "cutoffCount",
      EXISTS(SELECT 1 FROM class_opening_decisions d WHERE d.class_id=f.class_id AND d.scheduled_start_at=f.at AND d.outcome='BLOCKED') AS blocked
    FROM first_session f`,
    [classes.map((c) => c.id)],
  );
  const byId = new Map(rows.map((r) => [r.classId, r]));
  return new Map(
    classes.map((c) => {
      const row = byId.get(c.id);
      const state =
        c.status !== ClassStatus.OPEN
          ? 'NOT_OPEN'
          : !row?.scheduledStartAt
            ? 'NO_SCHEDULE'
            : row.now < row.scheduledStartAt
              ? 'TOO_EARLY'
              : row.blocked || row.cutoffCount < 3
                ? 'RESCHEDULE_REQUIRED'
                : 'ELIGIBLE';
      return [
        c.id,
        {
          minStudents: 3,
          activeStudentCount: row?.activeStudentCount ?? 0,
          scheduledStartAt: row?.scheduledStartAt ?? null,
          startEligibility: state,
          startIneligibilityReason: state === 'ELIGIBLE' ? null : state,
        },
      ];
    }),
  );
}

/** Caller locks Class first, as payment settlement does. Cutoff is the first scheduled start. */
@Injectable()
export class ClassOpeningService {
  constructor(private readonly db: DataSource) {}

  async eligibility(m: EntityManager, c: ClassEntity): Promise<ClassStartEligibility> {
    return readClassStartEligibility(m, c);
  }

  /** Persists a single decision per timetable anchor, including blocked attempts. */
  async decide(m: EntityManager, c: ClassEntity): Promise<boolean> {
    const e = await this.eligibility(m, c);
    if (
      !e.scheduledStartAt ||
      ['NOT_OPEN', 'NO_SCHEDULE', 'TOO_EARLY'].includes(e.startEligibility)
    )
      return false;
    const started = e.startEligibility === 'ELIGIBLE';
    await m.query(
      `INSERT INTO class_opening_decisions(class_id,scheduled_start_at,active_student_count,outcome)
      SELECT $1,$2,count(DISTINCT e.student_id)::int,$3 FROM enrollments e
      JOIN order_details d ON d.id=e.order_detail_id JOIN orders o ON o.id=d.order_id
      WHERE e.class_id=$1 AND o.status='PAID' AND o.paid_at<=$2 AND e.enrolled_at<=$2
        AND (SELECT h.status FROM class_opening_enrollment_events h WHERE h.enrollment_id=e.id AND h.effective_at<=$2 ORDER BY h.effective_at DESC,h.id DESC LIMIT 1)='ACTIVE'
      ON CONFLICT DO NOTHING`,
      [c.id, e.scheduledStartAt, started ? 'STARTED' : 'BLOCKED'],
    );
    if (started) {
      c.status = ClassStatus.IN_PROGRESS;
      c.assignmentVersion += 1;
      await m.getRepository(ClassEntity).save(c);
    }
    return started;
  }

  async assertCanStart(m: EntityManager, c: ClassEntity, skipTime = false): Promise<void> {
    const e = await this.eligibility(m, c);
    // Waive only the future schedule; the paid active minimum still applies.
    if (skipTime && e.startEligibility === 'TOO_EARLY' && e.activeStudentCount >= e.minStudents)
      return;
    if (e.startEligibility !== 'ELIGIBLE')
      throw new TeachingConflictException(
        'CLASS_START_INELIGIBLE',
        e.startIneligibilityReason ?? 'Class cannot start',
      );
    await this.decide(m, c);
  }

  async runBatch(): Promise<void> {
    await this.db.transaction(async (m) => {
      const classes = await m
        .getRepository(ClassEntity)
        .createQueryBuilder('c')
        .where("c.status='OPEN'")
        .andWhere(
          `EXISTS(SELECT 1 FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id WHERE u.class_id=c.id AND s.status<>'CANCELLED' AND s.starts_at<=clock_timestamp())`,
        )
        .andWhere(
          `NOT EXISTS(SELECT 1 FROM class_opening_decisions d WHERE d.class_id=c.id AND d.scheduled_start_at=(SELECT min(s.starts_at) FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id WHERE u.class_id=c.id AND s.status<>'CANCELLED'))`,
        )
        .orderBy('c.id')
        .take(50)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      for (const c of classes) await this.decide(m, c);
    });
  }
}
