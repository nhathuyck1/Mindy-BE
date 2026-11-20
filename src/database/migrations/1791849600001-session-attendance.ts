import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SessionAttendance1791849600001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE class_units ADD CONSTRAINT uq_class_units_id_class UNIQUE(id,class_id);
      ALTER TABLE enrollments ADD CONSTRAINT uq_enrollments_id_class UNIQUE(id,class_id);
      ALTER TABLE class_sessions ADD class_id uuid;
      UPDATE class_sessions s SET class_id=u.class_id FROM class_units u WHERE u.id=s.class_unit_id;
      ALTER TABLE class_sessions ALTER class_id SET NOT NULL;
      ALTER TABLE class_sessions ADD CONSTRAINT uq_class_sessions_id_class UNIQUE(id,class_id),
        ADD CONSTRAINT fk_class_sessions_unit_class FOREIGN KEY(class_unit_id,class_id)
        REFERENCES class_units(id,class_id) ON DELETE RESTRICT;
      CREATE INDEX idx_class_sessions_class_status ON class_sessions(class_id,status);
      CREATE FUNCTION derive_session_class() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.class_id IS NULL THEN
          SELECT class_id INTO NEW.class_id FROM class_units WHERE id=NEW.class_unit_id;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_session_class BEFORE INSERT ON class_sessions
        FOR EACH ROW EXECUTE FUNCTION derive_session_class();`);
    await q.query(`CREATE TYPE attendance_status_enum AS ENUM ('UNMARKED','PRESENT','ABSENT');
      CREATE TABLE attendance_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL,
        enrollment_id uuid NOT NULL, session_id uuid NOT NULL,
        status attendance_status_enum NOT NULL DEFAULT 'UNMARKED',
        checked_in_at timestamptz, recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        admitted_at timestamptz NOT NULL, admission_source varchar(30) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_attendance_enrollment_session UNIQUE(enrollment_id,session_id),
        CONSTRAINT fk_attendance_enrollment_class FOREIGN KEY(enrollment_id,class_id)
          REFERENCES enrollments(id,class_id) ON DELETE RESTRICT,
        CONSTRAINT fk_attendance_session_class FOREIGN KEY(session_id,class_id)
          REFERENCES class_sessions(id,class_id) ON DELETE RESTRICT);
      CREATE INDEX idx_attendance_session_status ON attendance_records(session_id,status);
      CREATE TABLE attendance_audits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        attendance_id uuid NOT NULL REFERENCES attendance_records(id) ON DELETE RESTRICT,
        actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        old_status attendance_status_enum, new_status attendance_status_enum NOT NULL,
        reason varchar(1000), action varchar(30) NOT NULL, version integer NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX idx_attendance_audits_record ON attendance_audits(attendance_id,occurred_at);
      CREATE TABLE session_lifecycle_audits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
        actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        old_status session_status_enum NOT NULL, new_status session_status_enum NOT NULL,
        reason varchar(1000), version integer NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX idx_session_lifecycle_audits_session ON session_lifecycle_audits(session_id,occurred_at);
      CREATE TABLE attendance_mutation_receipts (
        actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        route varchar(200) NOT NULL, key uuid NOT NULL, payload_hash varchar(64) NOT NULL,
        outcome jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(actor_id,route,key));`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM attendance_records) OR EXISTS(SELECT 1 FROM attendance_audits)
        OR EXISTS(SELECT 1 FROM session_lifecycle_audits) OR EXISTS(SELECT 1 FROM attendance_mutation_receipts)
      THEN RAISE EXCEPTION 'Attendance history exists; retain schema and roll back application only'; END IF;
    END $$`);
    await q.query(`DROP TABLE attendance_mutation_receipts,session_lifecycle_audits,attendance_audits,attendance_records;
      DROP TYPE attendance_status_enum;
      DROP TRIGGER trg_session_class ON class_sessions; DROP FUNCTION derive_session_class();
      ALTER TABLE class_sessions DROP CONSTRAINT fk_class_sessions_unit_class,
        DROP CONSTRAINT uq_class_sessions_id_class, DROP class_id;
      ALTER TABLE enrollments DROP CONSTRAINT uq_enrollments_id_class;
      ALTER TABLE class_units DROP CONSTRAINT uq_class_units_id_class;`);
  }
}
