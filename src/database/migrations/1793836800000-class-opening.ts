import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ClassOpening1793836800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE class_opening_enrollment_events (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
        status text NOT NULL,
        effective_at timestamptz NOT NULL
      );
      CREATE INDEX idx_opening_enrollment_time ON class_opening_enrollment_events(enrollment_id,effective_at DESC,id DESC);
      INSERT INTO class_opening_enrollment_events(enrollment_id,status,effective_at)
        SELECT id,'ACTIVE',enrolled_at FROM enrollments WHERE enrolled_at IS NOT NULL;
      INSERT INTO class_opening_enrollment_events(enrollment_id,status,effective_at)
        SELECT id,status::text,updated_at FROM enrollments WHERE status<>'ACTIVE';
      CREATE FUNCTION record_opening_enrollment_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
          INSERT INTO class_opening_enrollment_events(enrollment_id,status,effective_at)
          VALUES(NEW.id,NEW.status::text,clock_timestamp());
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_opening_enrollment_event AFTER INSERT OR UPDATE OF status ON enrollments FOR EACH ROW EXECUTE FUNCTION record_opening_enrollment_event();
      CREATE TABLE class_opening_decisions (
        class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
        scheduled_start_at timestamptz NOT NULL,
        active_student_count integer NOT NULL CHECK(active_student_count>=0),
        outcome text NOT NULL CHECK(outcome IN ('STARTED','BLOCKED')),
        decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(class_id,scheduled_start_at)
      );
      CREATE TABLE class_weekly_schedules (
        class_id uuid PRIMARY KEY REFERENCES classes(id) ON DELETE RESTRICT,
        start_date date NOT NULL,
        weekly_slots jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    const rows: { exists: boolean }[] = await q.query(
      'SELECT EXISTS(SELECT 1 FROM class_opening_decisions) AS exists',
    );
    if (rows[0]?.exists) throw new Error('Opening decisions exist; use a forward migration');
    await q.query(
      'DROP TABLE class_weekly_schedules; DROP TABLE class_opening_decisions; DROP TRIGGER trg_opening_enrollment_event ON enrollments; DROP FUNCTION record_opening_enrollment_event(); DROP TABLE class_opening_enrollment_events',
    );
  }
}
