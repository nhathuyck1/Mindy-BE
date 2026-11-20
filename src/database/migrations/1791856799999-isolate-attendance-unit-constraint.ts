import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Runs after attendance and before release; renames preserve the indexes used by existing FKs. */
export class IsolateAttendanceUnitConstraint1791856799999 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF to_regclass('attendance_records') IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'class_units'::regclass AND conname = 'uq_class_units_id_class'
      ) THEN
        ALTER TABLE class_units RENAME CONSTRAINT uq_class_units_id_class
          TO uq_class_units_attendance_context;
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'class_units'::regclass AND conname = 'uq_class_units_release_context'
      ) THEN
        ALTER TABLE class_units RENAME CONSTRAINT uq_class_units_release_context
          TO uq_class_units_id_class;
      END IF;
    END $$`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'class_units'::regclass AND conname = 'uq_class_units_attendance_context'
      ) THEN
        IF to_regclass('class_unit_release_audit') IS NOT NULL AND EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'class_units'::regclass AND conname = 'uq_class_units_id_class'
        ) THEN
          ALTER TABLE class_units RENAME CONSTRAINT uq_class_units_id_class
            TO uq_class_units_release_context;
        END IF;
        ALTER TABLE class_units RENAME CONSTRAINT uq_class_units_attendance_context
          TO uq_class_units_id_class;
      END IF;
    END $$`);
  }
}
