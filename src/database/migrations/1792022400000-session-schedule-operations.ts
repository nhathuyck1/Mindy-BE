import type { MigrationInterface, QueryRunner } from 'typeorm';

/** First 4.4a slice. No leave/guest schema or historical attendance backfill. */
export class SessionScheduleOperations1792022400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE class_sessions
      ADD makeup_for_session_id uuid,
      ADD makeup_root_session_id uuid,
      ADD CONSTRAINT uq_sessions_id_unit UNIQUE(id,class_unit_id),
      ADD CONSTRAINT ck_session_makeup_pair CHECK (
        (makeup_for_session_id IS NULL AND makeup_root_session_id IS NULL) OR
        (makeup_for_session_id IS NOT NULL AND makeup_root_session_id IS NOT NULL
          AND makeup_for_session_id <> id AND makeup_root_session_id <> id)),
      ADD CONSTRAINT fk_session_makeup_source FOREIGN KEY(makeup_for_session_id,class_unit_id)
        REFERENCES class_sessions(id,class_unit_id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_session_makeup_root FOREIGN KEY(makeup_root_session_id,class_unit_id)
        REFERENCES class_sessions(id,class_unit_id) ON DELETE RESTRICT`);
    await q.query(`CREATE UNIQUE INDEX uq_session_makeup_successor
      ON class_sessions(makeup_for_session_id) WHERE makeup_for_session_id IS NOT NULL`);
    await q.query(`CREATE UNIQUE INDEX uq_session_makeup_effective_root
      ON class_sessions(makeup_root_session_id)
      WHERE makeup_root_session_id IS NOT NULL AND status <> 'CANCELLED'`);
    await q.query(`CREATE FUNCTION protect_session_makeup_ancestry() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE source class_sessions%ROWTYPE;
      BEGIN
        IF TG_OP = 'UPDATE' AND
          (NEW.makeup_for_session_id IS DISTINCT FROM OLD.makeup_for_session_id OR
           NEW.makeup_root_session_id IS DISTINCT FROM OLD.makeup_root_session_id) THEN
          RAISE EXCEPTION 'Makeup ancestry is immutable' USING ERRCODE='23514', CONSTRAINT='ck_session_makeup_ancestry';
        END IF;
        IF NEW.makeup_for_session_id IS NOT NULL THEN
          SELECT * INTO source FROM class_sessions WHERE id=NEW.makeup_for_session_id FOR UPDATE;
          IF NOT FOUND OR source.status <> 'CANCELLED' OR
            NEW.makeup_root_session_id IS DISTINCT FROM COALESCE(source.makeup_root_session_id,source.id) THEN
            RAISE EXCEPTION 'Invalid makeup ancestry' USING ERRCODE='23514', CONSTRAINT='ck_session_makeup_ancestry';
          END IF;
        END IF;
        IF NEW.status <> 'CANCELLED' AND EXISTS (
          SELECT 1 FROM class_sessions WHERE makeup_for_session_id=NEW.id) THEN
          RAISE EXCEPTION 'A replaced source must remain cancelled' USING ERRCODE='23514', CONSTRAINT='ck_session_makeup_ancestry';
        END IF;
        RETURN NEW;
      END $$`);
    await q.query(`CREATE TRIGGER trg_session_makeup_ancestry
      BEFORE INSERT OR UPDATE ON class_sessions
      FOR EACH ROW EXECUTE FUNCTION protect_session_makeup_ancestry()`);
    await q.query(`CREATE TABLE session_schedule_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
      actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      action varchar(20) NOT NULL CHECK(action IN ('RESCHEDULE','CANCEL','MAKEUP','CLASS_CANCEL')),
      reason varchar(1000) NOT NULL CHECK(length(trim(reason)) > 0),
      old_state jsonb NOT NULL, new_state jsonb NOT NULL,
      class_end_date_before date NOT NULL, class_end_date_after date NOT NULL,
      version integer NOT NULL CHECK(version >= 1), occurred_at timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX idx_session_schedule_audits_session
      ON session_schedule_audits(session_id,occurred_at DESC,id DESC)`);
    await q.query(`CREATE INDEX idx_session_schedule_audits_class
      ON session_schedule_audits(class_id,occurred_at DESC,id DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM session_schedule_audits) OR
        EXISTS(SELECT 1 FROM class_sessions WHERE makeup_for_session_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Schedule history exists; retain schema and roll back application only';
      END IF;
    END $$`);
    await q.query('DROP TABLE session_schedule_audits');
    await q.query('DROP TRIGGER trg_session_makeup_ancestry ON class_sessions');
    await q.query('DROP FUNCTION protect_session_makeup_ancestry()');
    await q.query(`ALTER TABLE class_sessions DROP CONSTRAINT fk_session_makeup_source,
      DROP CONSTRAINT fk_session_makeup_root, DROP CONSTRAINT uq_sessions_id_unit,
      DROP CONSTRAINT ck_session_makeup_pair,
      DROP COLUMN makeup_for_session_id, DROP COLUMN makeup_root_session_id`);
  }
}
