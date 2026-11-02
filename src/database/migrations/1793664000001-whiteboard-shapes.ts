import type { MigrationInterface, QueryRunner } from 'typeorm';
export class WhiteboardShapes1793664000001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE whiteboards ALTER COLUMN schema_version SET DEFAULT 2');
    await q.query('UPDATE whiteboards SET schema_version=2');
    await q.query(
      'ALTER TABLE whiteboard_snapshots ADD COLUMN schema_version integer NOT NULL DEFAULT 1',
    );
    await q.query(`CREATE OR REPLACE FUNCTION whiteboard_session_end() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status::text='COMPLETED' AND OLD.status IS DISTINCT FROM NEW.status THEN
          INSERT INTO whiteboard_snapshots(board_id,epoch,sequence,control_version,reason,checkpoint,projection,checksum,created_by,schema_version)
          SELECT id,epoch,sequence,control_version,'SESSION_END',checkpoint,projection,
            encode(sha256(checkpoint),'hex'),NEW.completed_by,schema_version FROM whiteboards WHERE session_id=NEW.id
          ON CONFLICT DO NOTHING;
        END IF;RETURN NEW;
      END $$`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM whiteboards b CROSS JOIN LATERAL jsonb_array_elements(b.projection) s WHERE s->>'type' IN ('rectangle','ellipse','text'))
      OR EXISTS(SELECT 1 FROM whiteboard_snapshots b CROSS JOIN LATERAL jsonb_array_elements(b.projection) s WHERE s->>'type' IN ('rectangle','ellipse','text'))
      OR EXISTS(SELECT 1 FROM whiteboard_exports b CROSS JOIN LATERAL jsonb_array_elements(b.projection) s WHERE s->>'type' IN ('rectangle','ellipse','text'))
      THEN RAISE EXCEPTION 'Cannot downgrade while shape v2 data exists';END IF;END $$`);
    await q.query(`CREATE OR REPLACE FUNCTION whiteboard_session_end() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status::text='COMPLETED' AND OLD.status IS DISTINCT FROM NEW.status THEN
          INSERT INTO whiteboard_snapshots(board_id,epoch,sequence,control_version,reason,checkpoint,projection,checksum,created_by)
          SELECT id,epoch,sequence,control_version,'SESSION_END',checkpoint,projection,
            encode(sha256(checkpoint),'hex'),NEW.completed_by FROM whiteboards WHERE session_id=NEW.id ON CONFLICT DO NOTHING;
        END IF;RETURN NEW;
      END $$`);
    await q.query('ALTER TABLE whiteboard_snapshots DROP COLUMN schema_version');
    await q.query('ALTER TABLE whiteboards ALTER COLUMN schema_version SET DEFAULT 1');
    await q.query('UPDATE whiteboards SET schema_version=1');
  }
}
