import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive Classes-owned history; no changes to existing release values. */
export class ClassUnitReleaseAudit1791856800000 implements MigrationInterface {
  name = 'ClassUnitReleaseAudit1791856800000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE class_units ADD CONSTRAINT uq_class_units_id_class UNIQUE (id, class_id)',
    );
    await q.query(`CREATE TABLE class_unit_release_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      class_unit_id uuid NOT NULL,
      before_status class_unit_status_enum NOT NULL,
      after_status class_unit_status_enum NOT NULL,
      before_unlock_at timestamptz,
      after_unlock_at timestamptz,
      occurred_at timestamptz NOT NULL,
      CONSTRAINT fk_class_unit_release_audit_unit FOREIGN KEY (class_unit_id, class_id)
        REFERENCES class_units(id, class_id) ON DELETE RESTRICT,
      CONSTRAINT ck_class_unit_release_audit_status CHECK (
        before_status IN ('LOCKED','OPEN') AND after_status IN ('LOCKED','OPEN')),
      CONSTRAINT ck_class_unit_release_audit_changed CHECK (
        before_status <> after_status OR before_unlock_at IS DISTINCT FROM after_unlock_at)
    )`);
    await q.query(
      'CREATE INDEX idx_class_unit_release_audit_unit_time ON class_unit_release_audit(class_unit_id, occurred_at, id)',
    );
    await q.query(
      'CREATE INDEX idx_class_unit_release_audit_class ON class_unit_release_audit(class_id)',
    );
    await q.query(
      'CREATE INDEX idx_class_unit_release_audit_actor ON class_unit_release_audit(actor_id)',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE class_unit_release_audit');
    await q.query('ALTER TABLE class_units DROP CONSTRAINT uq_class_units_id_class');
  }
}
