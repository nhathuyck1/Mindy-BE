import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceRecoveryEvidence1791849600003 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE attendance_records ADD CONSTRAINT uq_attendance_id_session UNIQUE(id,session_id);
      ALTER TABLE attendance_records ADD CONSTRAINT uq_attendance_id_enrollment UNIQUE(id,enrollment_id);
      ALTER TABLE enrollments ADD CONSTRAINT uq_enrollment_id_detail UNIQUE(id,order_detail_id);
      ALTER TABLE payment_transactions ADD CONSTRAINT uq_payment_id_order UNIQUE(id,order_id);
      ALTER TABLE order_details ADD CONSTRAINT uq_order_detail_id_order UNIQUE(id,order_id);
      CREATE TABLE attendance_recovery_audits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
        actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        version integer NOT NULL CHECK(version > 0),
        reason varchar(1000) NOT NULL CHECK(length(trim(reason)) > 0),
        evidence_note varchar(2000) NOT NULL CHECK(length(trim(evidence_note)) > 0),
        old_status session_status_enum NOT NULL, new_status session_status_enum NOT NULL,
        old_actual_started_at timestamptz, new_actual_started_at timestamptz NOT NULL,
        old_actual_ended_at timestamptz, new_actual_ended_at timestamptz NOT NULL,
        old_editable_until timestamptz, new_editable_until timestamptz NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_recovery_session_version UNIQUE(session_id,version),
        CONSTRAINT uq_recovery_id_session UNIQUE(id,session_id),
        CONSTRAINT ck_recovery_clocks CHECK(new_actual_started_at < new_actual_ended_at),
        CONSTRAINT ck_recovery_status CHECK(old_status IN ('SCHEDULED','COMPLETED') AND new_status='COMPLETED'));
      CREATE TABLE attendance_recovery_audit_items (
        recovery_audit_id uuid NOT NULL, attendance_id uuid NOT NULL, session_id uuid NOT NULL, enrollment_id uuid NOT NULL,
        admission_basis varchar(30) NOT NULL CHECK(admission_basis IN ('PAID_BEFORE_START','CASH_LATE_ADMISSION')),
        order_detail_id uuid NOT NULL, order_id uuid NOT NULL, payment_id uuid NOT NULL,
        paid_at timestamptz NOT NULL,
        PRIMARY KEY(recovery_audit_id,attendance_id),
        CONSTRAINT uq_recovery_item_attendance UNIQUE(attendance_id),
        CONSTRAINT fk_recovery_item_audit FOREIGN KEY(recovery_audit_id,session_id)
          REFERENCES attendance_recovery_audits(id,session_id) ON DELETE RESTRICT,
        CONSTRAINT fk_recovery_item_record FOREIGN KEY(attendance_id,session_id)
          REFERENCES attendance_records(id,session_id) ON DELETE RESTRICT,
        CONSTRAINT fk_recovery_item_enrollment FOREIGN KEY(attendance_id,enrollment_id)
          REFERENCES attendance_records(id,enrollment_id) ON DELETE RESTRICT,
        CONSTRAINT fk_recovery_item_hold FOREIGN KEY(enrollment_id,order_detail_id)
          REFERENCES enrollments(id,order_detail_id) ON DELETE RESTRICT,
        CONSTRAINT fk_recovery_item_line FOREIGN KEY(order_detail_id,order_id)
          REFERENCES order_details(id,order_id) ON DELETE RESTRICT,
        CONSTRAINT fk_recovery_item_payment FOREIGN KEY(payment_id,order_id)
          REFERENCES payment_transactions(id,order_id) ON DELETE RESTRICT);
      CREATE INDEX idx_recovery_session_history ON attendance_recovery_audits(session_id,occurred_at DESC,id DESC);
      CREATE INDEX idx_attendance_audits_history ON attendance_audits(attendance_id,occurred_at DESC,id DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM attendance_recovery_audits) OR EXISTS(SELECT 1 FROM attendance_recovery_audit_items)
        OR EXISTS(SELECT 1 FROM attendance_audits WHERE action IN ('CORRECT','RECOVER'))
      THEN RAISE EXCEPTION 'Correction/recovery history exists; retain schema and roll back application only'; END IF;
    END $$`);
    await q.query(`DROP INDEX idx_attendance_audits_history;
      DROP TABLE attendance_recovery_audit_items,attendance_recovery_audits;
      ALTER TABLE attendance_records DROP CONSTRAINT uq_attendance_id_session;
      ALTER TABLE attendance_records DROP CONSTRAINT uq_attendance_id_enrollment;
      ALTER TABLE enrollments DROP CONSTRAINT uq_enrollment_id_detail;
      ALTER TABLE payment_transactions DROP CONSTRAINT uq_payment_id_order;
      ALTER TABLE order_details DROP CONSTRAINT uq_order_detail_id_order;`);
  }
}
