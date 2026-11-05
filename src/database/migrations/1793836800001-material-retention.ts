import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MaterialRetention1793836800001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE materials ADD COLUMN last_seen_at timestamptz,
      ADD COLUMN tracking_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      ADD COLUMN is_unseen boolean NOT NULL DEFAULT false;
      CREATE INDEX idx_materials_unseen ON materials(is_unseen,last_seen_at,id) WHERE deleted_at IS NULL;
      CREATE TABLE material_file_cleanup_jobs (
        file_id uuid PRIMARY KEY REFERENCES file_objects(id) ON DELETE RESTRICT,
        status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','DONE','SKIPPED','FAILED')),
        attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        lease_until timestamptz, lease_token uuid, manifest jsonb NOT NULL DEFAULT '[]',
        reclaimable_bytes bigint NOT NULL DEFAULT 0, reclaimed_bytes bigint NOT NULL DEFAULT 0,
        error_code text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz
      );
      CREATE INDEX idx_material_cleanup_pending ON material_file_cleanup_jobs(available_at) WHERE status IN ('PENDING','RUNNING');
      CREATE FUNCTION enqueue_material_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
          INSERT INTO material_file_cleanup_jobs(file_id)
          SELECT DISTINCT id FROM (
            SELECT NEW.file_object_id AS id UNION SELECT file_id FROM material_file_references WHERE material_id=NEW.id
            UNION SELECT preview_file_id FROM file_metadata WHERE file_object_id=NEW.file_object_id OR file_object_id IN (SELECT file_id FROM material_file_references WHERE material_id=NEW.id)
          ) f WHERE id IS NOT NULL ORDER BY id
          ON CONFLICT(file_id) DO UPDATE SET status='PENDING',attempts=0,available_at=clock_timestamp(),completed_at=NULL WHERE material_file_cleanup_jobs.status='SKIPPED';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_material_cleanup AFTER UPDATE OF deleted_at ON materials FOR EACH ROW EXECUTE FUNCTION enqueue_material_cleanup();
    `);
    // Additive replacements retain the existing scope/kind/provenance invariants.
    const defs: { name: string; definition: string }[] = await q.query(
      `SELECT proname AS name,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('guard_material_content','guard_material_reference','guard_referenced_file') AND pronamespace='public'::regnamespace`,
    );
    for (const f of defs) {
      let sql = f.definition;
      if (f.name === 'guard_material_content')
        sql = sql.replace(
          "IF f.course_unit_id <> NEW.course_unit_id OR f.status <> 'READY' OR f.deleted_at IS NOT NULL THEN",
          "IF NEW.deleted_at IS NULL AND (f.course_unit_id <> NEW.course_unit_id OR f.status <> 'READY' OR f.deleted_at IS NOT NULL) THEN",
        );
      if (f.name === 'guard_material_reference')
        sql = sql.replace(
          'IF m.id IS NULL OR f.id IS NULL',
          'IF m.id IS NULL OR m.deleted_at IS NOT NULL OR f.id IS NULL',
        );
      if (f.name === 'guard_referenced_file')
        sql = sql
          .replace(
            'WHERE file_object_id = OLD.id)',
            'WHERE file_object_id = OLD.id AND deleted_at IS NULL)',
          )
          .replace(
            'SELECT 1 FROM material_file_references WHERE file_id = OLD.id)',
            'SELECT 1 FROM material_file_references r JOIN materials m ON m.id=r.material_id WHERE r.file_id = OLD.id AND m.deleted_at IS NULL)',
          );
      if (sql === f.definition) throw new Error(`Unexpected ${f.name} definition`);
      await q.query(sql);
    }
    await q.query(`CREATE FUNCTION guard_material_restore() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN RAISE EXCEPTION 'Deleted materials cannot be restored' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER trg_material_restore BEFORE UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION guard_material_restore();`);
    await q.query(`CREATE FUNCTION guard_cleanup_preview() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.preview_file_id IS NOT NULL THEN
        PERFORM 1 FROM file_objects WHERE id=NEW.preview_file_id AND status='READY' AND deleted_at IS NULL FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Preview file unavailable' USING ERRCODE='23514'; END IF;
      END IF; RETURN NEW; END $$;
      CREATE TRIGGER trg_cleanup_preview BEFORE INSERT OR UPDATE OF preview_file_id ON file_metadata FOR EACH ROW EXECUTE FUNCTION guard_cleanup_preview();`);
  }
  async down(q: QueryRunner): Promise<void> {
    const rows: { exists: boolean }[] = await q.query(
      `SELECT EXISTS(SELECT 1 FROM material_file_cleanup_jobs) AS exists`,
    );
    if (rows[0]?.exists) throw new Error('Cleanup history exists; use forward migration');
    const defs: { name: string; definition: string }[] = await q.query(
      `SELECT proname AS name,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('guard_material_content','guard_material_reference','guard_referenced_file') AND pronamespace='public'::regnamespace`,
    );
    for (const f of defs)
      await q.query(
        f.definition
          .replace(
            "IF NEW.deleted_at IS NULL AND (f.course_unit_id <> NEW.course_unit_id OR f.status <> 'READY' OR f.deleted_at IS NOT NULL) THEN",
            "IF f.course_unit_id <> NEW.course_unit_id OR f.status <> 'READY' OR f.deleted_at IS NOT NULL THEN",
          )
          .replace(
            'IF m.id IS NULL OR m.deleted_at IS NOT NULL OR f.id IS NULL',
            'IF m.id IS NULL OR f.id IS NULL',
          )
          .replace(
            'WHERE file_object_id = OLD.id AND deleted_at IS NULL)',
            'WHERE file_object_id = OLD.id)',
          )
          .replace(
            'SELECT 1 FROM material_file_references r JOIN materials m ON m.id=r.material_id WHERE r.file_id = OLD.id AND m.deleted_at IS NULL)',
            'SELECT 1 FROM material_file_references WHERE file_id = OLD.id)',
          ),
      );
    await q.query(`DROP TRIGGER trg_cleanup_preview ON file_metadata; DROP FUNCTION guard_cleanup_preview(); DROP TRIGGER trg_material_cleanup ON materials; DROP TRIGGER trg_material_restore ON materials;
      DROP FUNCTION enqueue_material_cleanup(),guard_material_restore(); DROP TABLE material_file_cleanup_jobs;
      ALTER TABLE materials DROP COLUMN last_seen_at,DROP COLUMN tracking_started_at,DROP COLUMN is_unseen;`);
  }
}
