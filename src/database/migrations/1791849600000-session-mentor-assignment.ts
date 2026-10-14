import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Expand only: no attendance backfill and no guesses about historical teachers. */
export class SessionMentorAssignment1791849600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TYPE session_status_enum RENAME TO session_status_enum_old');
    await q.query(
      "CREATE TYPE session_status_enum AS ENUM ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')",
    );
    await q.query('ALTER TABLE class_sessions ALTER status DROP DEFAULT');
    await q.query(
      'ALTER TABLE class_sessions ALTER status TYPE session_status_enum USING status::text::session_status_enum',
    );
    await q.query("ALTER TABLE class_sessions ALTER status SET DEFAULT 'SCHEDULED'");
    await q.query('DROP TYPE session_status_enum_old');

    await q.query(`ALTER TABLE classes ADD assignment_version integer NOT NULL DEFAULT 1
      CONSTRAINT ck_classes_assignment_version CHECK (assignment_version >= 1)`);
    await q.query(`ALTER TABLE class_sessions
      ADD mentor_override_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      ADD teaching_mentor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      ADD actual_started_at timestamptz, ADD actual_ended_at timestamptz,
      ADD started_by uuid REFERENCES users(id) ON DELETE RESTRICT,
      ADD completed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
      ADD editable_until timestamptz,
      ADD version integer NOT NULL DEFAULT 1 CONSTRAINT ck_sessions_version CHECK (version >= 1)`);
    await q.query(`CREATE TABLE teaching_assignment_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      session_id uuid REFERENCES class_sessions(id) ON DELETE RESTRICT,
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      old_mentor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      new_mentor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      reason varchar(1000) NOT NULL CHECK (length(trim(reason)) > 0),
      version integer NOT NULL CHECK (version >= 1),
      occurred_at timestamptz NOT NULL DEFAULT now())`);
    await q.query(
      'CREATE INDEX idx_teaching_assignment_audits_class ON teaching_assignment_audits(class_id, occurred_at)',
    );
    await q.query(`CREATE TABLE teaching_mutation_receipts (
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      route varchar(200) NOT NULL, key uuid NOT NULL, payload_hash varchar(64) NOT NULL,
      outcome jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(actor_id, route, key))`);
    await q.query(
      'CREATE INDEX idx_class_sessions_override ON class_sessions(mentor_override_id, starts_at)',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    // Do not silently discard assignments/audit created after rollout.
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM teaching_assignment_audits)
        OR EXISTS (SELECT 1 FROM teaching_mutation_receipts)
        OR EXISTS (SELECT 1 FROM class_sessions WHERE mentor_override_id IS NOT NULL OR teaching_mentor_id IS NOT NULL OR status::text = 'IN_PROGRESS' OR actual_started_at IS NOT NULL OR actual_ended_at IS NOT NULL)
      THEN RAISE EXCEPTION 'Assignment history exists; retain schema and roll back application only'; END IF;
    END $$`);
    await q.query('DROP TABLE teaching_mutation_receipts, teaching_assignment_audits');
    await q.query(
      'ALTER TABLE class_sessions DROP mentor_override_id, DROP teaching_mentor_id, DROP version, DROP actual_started_at, DROP actual_ended_at, DROP started_by, DROP completed_by, DROP editable_until',
    );
    await q.query('ALTER TABLE classes DROP assignment_version');
    await q.query('ALTER TYPE session_status_enum RENAME TO session_status_enum_new');
    await q.query("CREATE TYPE session_status_enum AS ENUM ('SCHEDULED','COMPLETED','CANCELLED')");
    await q.query('ALTER TABLE class_sessions ALTER status DROP DEFAULT');
    await q.query(
      'ALTER TABLE class_sessions ALTER status TYPE session_status_enum USING status::text::session_status_enum',
    );
    await q.query("ALTER TABLE class_sessions ALTER status SET DEFAULT 'SCHEDULED'");
    await q.query('DROP TYPE session_status_enum_new');
  }
}
