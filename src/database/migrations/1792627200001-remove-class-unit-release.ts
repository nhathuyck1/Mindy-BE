import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Retain legacy columns/audits for compatibility; access now follows enrollment. */
export class RemoveClassUnitRelease1792627200001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE class_units ALTER COLUMN status SET DEFAULT 'OPEN'`);
    await q.query(`UPDATE class_units SET
      status = CASE WHEN status = 'LOCKED' THEN 'OPEN'::class_unit_status_enum ELSE status END,
      unlock_at = NULL
      WHERE status = 'LOCKED' OR unlock_at IS NOT NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    // Former manual locks/schedules cannot be reconstructed. Do not relock paid students.
    await q.query(`ALTER TABLE class_units ALTER COLUMN status SET DEFAULT 'LOCKED'`);
  }
}
