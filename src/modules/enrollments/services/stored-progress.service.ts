import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import type {
  StoredProgressSummaryDto,
  StoredProgressUnitDto,
} from '../dtos/stored-progress.dto.js';

export function storedPercent(value: string | null): {
  progressPercent: string | null;
  dataQuality: StoredProgressUnitDto['dataQuality'];
} {
  if (value === null) return { progressPercent: null, dataQuality: 'UNTRACKED' };
  const valid = /^\d+(\.\d+)?$/.test(value) && Number(value) >= 0 && Number(value) <= 100;
  return {
    progressPercent: valid ? value : null,
    dataQuality: valid ? 'VALID' : 'INVALID_PERCENT',
  };
}

/** Public enrollment projection; caller authorizes class/student/unit in its read snapshot. */
@Injectable()
export class StoredProgressService {
  async summary(
    m: EntityManager,
    classId: string,
    page: PageOptionsDto,
    unitId?: string,
  ): Promise<{ items: StoredProgressSummaryDto[]; total: number }> {
    const counts: { total: number }[] = await m.query(
      'SELECT count(*)::int AS total FROM enrollments WHERE class_id=$1',
      [classId],
    );
    const items: StoredProgressSummaryDto[] = await m.query(
      `WITH paged AS (
      SELECT e.id,e.student_id,u.display_name FROM enrollments e JOIN users u ON u.id=e.student_id
      WHERE e.class_id=$1 ORDER BY u.display_name,e.id LIMIT $3 OFFSET $4)
      SELECT e.id AS "enrollmentId",e.student_id AS "studentId",e.display_name AS "displayName",
      count(p.id)::int AS "storedUnitCount",(count(u.id)-count(p.id))::int AS "untrackedUnitCount",
      count(p.id) FILTER(WHERE p.progress_percent<0 OR p.progress_percent>100 OR p.progress_percent::text IN ('NaN','Infinity','-Infinity'))::int AS "invalidStoredUnitCount"
      FROM paged e LEFT JOIN class_units u ON u.class_id=$1 AND ($2::uuid IS NULL OR u.id=$2)
      LEFT JOIN class_unit_progress p ON p.enrollment_id=e.id AND p.class_unit_id=u.id
      GROUP BY e.id,e.student_id,e.display_name ORDER BY e.display_name,e.id`,
      [classId, unitId ?? null, page.pageSize, (page.page - 1) * page.pageSize],
    );
    return { items, total: counts[0]?.total ?? 0 };
  }
  async units(
    m: EntityManager,
    classId: string,
    studentId: string,
    page: PageOptionsDto,
  ): Promise<{ items: StoredProgressUnitDto[]; total: number }> {
    const from =
      'FROM enrollments e JOIN class_units u ON u.class_id=e.class_id LEFT JOIN class_unit_progress p ON p.enrollment_id=e.id AND p.class_unit_id=u.id WHERE e.class_id=$1 AND e.student_id=$2';
    const counts: { total: number }[] = await m.query(`SELECT count(*)::int AS total ${from}`, [
      classId,
      studentId,
    ]);
    const rows: (Omit<StoredProgressUnitDto, 'trackingStatus' | 'dataQuality'> & {
      storedId: string | null;
    })[] = await m.query(
      `SELECT e.id AS "enrollmentId",u.id AS "classUnitId",p.id AS "storedId",p.status,p.progress_percent AS "progressPercent",p.completed_at AS "completedAt" ${from} ORDER BY e.id,u.position,u.id LIMIT $3 OFFSET $4`,
      [classId, studentId, page.pageSize, (page.page - 1) * page.pageSize],
    );
    return {
      items: rows.map(({ storedId, ...r }) => ({
        ...r,
        trackingStatus: storedId ? 'STORED' : 'UNTRACKED',
        ...storedPercent(r.progressPercent),
      })),
      total: counts[0]?.total ?? 0,
    };
  }
}
