import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Whiteboards1793664000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE whiteboards (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL UNIQUE REFERENCES class_sessions(id),
      title varchar(250) NOT NULL, mode varchar(16) NOT NULL DEFAULT 'PRESENTATION' CHECK(mode IN ('PRESENTATION','COLLABORATIVE')),
      epoch uuid NOT NULL DEFAULT gen_random_uuid(), control_version bigint NOT NULL DEFAULT 1,
      sequence bigint NOT NULL DEFAULT 0, schema_version integer NOT NULL DEFAULT 1,
      checkpoint bytea NOT NULL, projection jsonb NOT NULL DEFAULT '[]',
      created_by uuid NOT NULL REFERENCES users(id), last_persisted_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE TABLE whiteboard_updates (
      board_id uuid NOT NULL REFERENCES whiteboards(id), epoch uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
      update_id uuid NOT NULL, request_hash varchar(64) NOT NULL, sequence bigint NOT NULL,
      PRIMARY KEY(board_id,epoch,actor_id,update_id)
    )`);
    await q.query(`CREATE TABLE whiteboard_receipts (
      actor_id uuid NOT NULL REFERENCES users(id), key uuid NOT NULL, route varchar(150) NOT NULL,
      request_hash varchar(64) NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(actor_id,key)
    )`);
    await q.query(`CREATE TABLE whiteboard_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), board_id uuid NOT NULL REFERENCES whiteboards(id),
      epoch uuid NOT NULL, sequence bigint NOT NULL, control_version bigint NOT NULL,
      reason varchar(16) NOT NULL CHECK(reason IN ('MANUAL','SESSION_END','BEFORE_RESET')),
      checkpoint bytea NOT NULL, projection jsonb NOT NULL, checksum varchar(64) NOT NULL,
      created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      "CREATE UNIQUE INDEX uq_board_session_end ON whiteboard_snapshots(board_id) WHERE reason='SESSION_END'",
    );
    await q.query(
      'CREATE INDEX idx_board_snapshots ON whiteboard_snapshots(board_id,created_at DESC,id)',
    );
    await q.query(`CREATE TABLE whiteboard_assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), board_id uuid NOT NULL REFERENCES whiteboards(id),
      owner_id uuid NOT NULL REFERENCES users(id), filename varchar(250) NOT NULL, mime_type varchar(64) NOT NULL,
      size_bytes integer NOT NULL, bucket text NOT NULL, staging_key text NOT NULL,
      staging_version text, object_key text, object_version text, width integer, height integer,
      status varchar(16) NOT NULL DEFAULT 'PENDING_UPLOAD', error_code varchar(64),
      pages jsonb, result jsonb, lease_until timestamptz, lease_token uuid, attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes'
    )`);
    await q.query(`CREATE TABLE whiteboard_exports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), board_id uuid NOT NULL REFERENCES whiteboards(id),
      owner_id uuid NOT NULL REFERENCES users(id), format varchar(3) NOT NULL CHECK(format IN ('PNG','PDF')),
      epoch uuid NOT NULL, source_sequence bigint NOT NULL, projection jsonb NOT NULL, viewport jsonb,
      status varchar(16) NOT NULL DEFAULT 'QUEUED', bucket text, object_key text, object_version text,
      error_code varchar(64), lease_until timestamptz, lease_token uuid, attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
    )`);
    // Executed inside the lifecycle transaction: its Class -> Session locks fence all board writers.
    // An atomic DB outbox consumer avoids circular module imports and a crash window after finalize.
    await q.query(`CREATE FUNCTION whiteboard_session_end() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status::text='COMPLETED' AND OLD.status IS DISTINCT FROM NEW.status THEN
          INSERT INTO whiteboard_snapshots(board_id,epoch,sequence,control_version,reason,checkpoint,projection,checksum,created_by)
          SELECT id,epoch,sequence,control_version,'SESSION_END',checkpoint,projection,
            encode(sha256(checkpoint),'hex'),NEW.completed_by FROM whiteboards WHERE session_id=NEW.id
          ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
      END $$`);
    await q.query(`CREATE TRIGGER trg_whiteboard_session_end AFTER UPDATE OF status ON class_sessions
      FOR EACH ROW EXECUTE FUNCTION whiteboard_session_end()`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER trg_whiteboard_session_end ON class_sessions');
    await q.query('DROP FUNCTION whiteboard_session_end()');
    await q.query(
      'DROP TABLE whiteboard_exports,whiteboard_assets,whiteboard_snapshots,whiteboard_receipts,whiteboard_updates,whiteboards',
    );
  }
}
