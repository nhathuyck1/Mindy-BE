import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TeachingNotes1792627200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE teaching_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL CONSTRAINT uq_teaching_notes_session UNIQUE REFERENCES class_sessions(id) ON DELETE RESTRICT,
      content text NOT NULL CHECK (char_length(content)<=10000),
      next_steps text NOT NULL CHECK (char_length(next_steps)<=5000),
      version integer NOT NULL CHECK (version>0),
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE TABLE teaching_note_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      version integer NOT NULL CHECK(version>0), reason varchar(2000),
      snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_teaching_note_audit_version UNIQUE(session_id,version)
    )`);
    await q.query(`CREATE TABLE teaching_note_receipts (
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      idempotency_key uuid NOT NULL, request_hash varchar(64) NOT NULL,
      response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_teaching_note_receipts PRIMARY KEY(actor_id,idempotency_key)
    )`);
    await q.query(`CREATE FUNCTION reject_teaching_note_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Teaching note audits are append only'; END $$`);
    await q.query(`CREATE TRIGGER trg_teaching_note_audit_immutable BEFORE UPDATE OR DELETE ON teaching_note_audits
      FOR EACH ROW EXECUTE FUNCTION reject_teaching_note_audit_mutation()`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Explicit rollback removes note history; export it before rollback on a populated environment.
    await q.query('DROP TABLE teaching_note_receipts');
    await q.query('DROP TABLE teaching_note_audits');
    await q.query('DROP FUNCTION reject_teaching_note_audit_mutation()');
    await q.query('DROP TABLE teaching_notes');
  }
}
