import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive to the deployed read slice; enum replacement also works in one transaction. */
export class TypedManagerMaterials1791849600000 implements MigrationInterface {
  name = 'TypedManagerMaterials1791849600000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TYPE material_content_type_enum RENAME TO material_content_type_legacy_enum',
    );
    await q.query("CREATE TYPE material_content_type_enum AS ENUM ('ARTICLE','FILE','VIDEO')");
    await q.query(`ALTER TABLE materials
      ALTER COLUMN content_type TYPE material_content_type_enum USING content_type::text::material_content_type_enum,
      ALTER COLUMN file_object_id DROP NOT NULL,
      ADD COLUMN content_html text,
      ADD COLUMN content_schema_version integer,
      ADD CONSTRAINT ck_materials_typed_content CHECK (
        (content_type = 'ARTICLE' AND file_object_id IS NULL AND content_html IS NOT NULL
          AND octet_length(content_html) BETWEEN 1 AND 49152 AND content_schema_version IS NOT NULL AND content_schema_version = 1)
        OR (content_type IN ('FILE','VIDEO') AND file_object_id IS NOT NULL AND content_html IS NULL AND content_schema_version IS NULL))`);
    await q.query('DROP TYPE material_content_type_legacy_enum');
    await q.query(`CREATE TABLE material_file_references (
      material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      file_id uuid NOT NULL REFERENCES file_objects(id) ON DELETE RESTRICT,
      role varchar(20) NOT NULL CHECK(role IN ('INLINE_IMAGE','ATTACHMENT')),
      PRIMARY KEY(material_id,file_id,role)
    )`);
    await q.query('CREATE INDEX idx_material_references_file ON material_file_references(file_id)');
    await q.query(`CREATE TABLE material_audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      action varchar(20) NOT NULL CHECK(action IN ('CREATE','EDIT','DELETE','SUBMIT','APPROVE','REJECT','PUBLISH','UNPUBLISH')),
      revision integer NOT NULL CHECK(revision > 0), occurred_at timestamptz NOT NULL
    )`);
    await q.query(
      'CREATE INDEX idx_material_audit_history ON material_audit_events(material_id,occurred_at,id)',
    );
    await q.query('CREATE INDEX idx_material_audit_actor ON material_audit_events(actor_id)');
    await q.query(
      'CREATE INDEX idx_materials_queue ON materials(review_status,created_at DESC,id) WHERE deleted_at IS NULL',
    );
    await q.query(
      'CREATE INDEX idx_materials_submissions ON materials(created_by,created_in_class_id,review_status) WHERE deleted_at IS NULL',
    );
    await q.query(`CREATE FUNCTION guard_material_content() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE f file_objects%ROWTYPE; unit_id uuid; resolved_class_id uuid;
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.content_type IS DISTINCT FROM OLD.content_type OR NEW.content_schema_version IS DISTINCT FROM OLD.content_schema_version
           OR NEW.course_unit_id IS DISTINCT FROM OLD.course_unit_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
           OR NEW.created_in_class_id IS DISTINCT FROM OLD.created_in_class_id
           OR (OLD.first_approved_at IS NOT NULL AND NEW.first_approved_at IS DISTINCT FROM OLD.first_approved_at) THEN
          RAISE EXCEPTION 'Immutable material identity/approval' USING ERRCODE = '23514';
        END IF;
      END IF;
      -- SHARE conflicts with file state/scope UPDATE. Lock all retained references too.
      FOR f IN SELECT * FROM file_objects WHERE id = NEW.file_object_id OR id IN
          (SELECT file_id FROM material_file_references WHERE material_id = NEW.id) ORDER BY id FOR SHARE LOOP
        IF f.course_unit_id <> NEW.course_unit_id OR f.status <> 'READY' OR f.deleted_at IS NOT NULL THEN
          RAISE EXCEPTION 'Material file must be READY in its Unit' USING ERRCODE = '23514';
        END IF;
        IF f.id = NEW.file_object_id AND ((NEW.content_type = 'VIDEO' AND (f.kind IS DISTINCT FROM 'VIDEO' OR f.mime_type IS DISTINCT FROM 'video/mp4'))
            OR (NEW.content_type = 'FILE' AND (f.kind IS NULL OR f.kind = 'VIDEO'))) THEN
          RAISE EXCEPTION 'Material file kind mismatch' USING ERRCODE = '23514';
        END IF;
      END LOOP;
      IF EXISTS (SELECT 1 FROM material_file_references WHERE material_id = NEW.id AND file_id = NEW.file_object_id AND role = 'ATTACHMENT') THEN
        RAISE EXCEPTION 'Primary attachment duplicate' USING ERRCODE = '23514';
      END IF;
      IF NEW.session_id IS NOT NULL THEN
        SELECT cu.course_unit_id, cu.class_id INTO unit_id, resolved_class_id
          FROM class_sessions s JOIN class_units cu ON cu.id = s.class_unit_id
          WHERE s.id = NEW.session_id FOR SHARE OF s,cu;
        IF unit_id IS DISTINCT FROM NEW.course_unit_id OR (NEW.created_in_class_id IS NOT NULL AND resolved_class_id IS DISTINCT FROM NEW.created_in_class_id) THEN
          RAISE EXCEPTION 'Material session ancestry mismatch' USING ERRCODE = '23514';
        END IF;
      END IF;
      IF NEW.created_in_class_id IS NOT NULL THEN
        PERFORM 1 FROM class_units cu WHERE cu.class_id = NEW.created_in_class_id
          AND cu.course_unit_id = NEW.course_unit_id FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Material provenance mismatch' USING ERRCODE = '23514'; END IF;
        IF NOT EXISTS (SELECT 1 FROM classes c JOIN course_units u ON u.course_id = c.course_id
          WHERE c.id = NEW.created_in_class_id AND u.id = NEW.course_unit_id) THEN
          RAISE EXCEPTION 'Material provenance course mismatch' USING ERRCODE = '23514';
        END IF;
      END IF;
      IF NEW.session_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM classes c JOIN course_units u ON u.course_id = c.course_id
        WHERE c.id = resolved_class_id AND u.id = NEW.course_unit_id) THEN
        RAISE EXCEPTION 'Material course ancestry mismatch' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$`);
    await q.query(
      'CREATE TRIGGER trg_material_content BEFORE INSERT OR UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION guard_material_content()',
    );
    await q.query(`CREATE FUNCTION guard_material_reference() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE m materials%ROWTYPE; f file_objects%ROWTYPE;
    BEGIN
      SELECT * INTO m FROM materials WHERE id = NEW.material_id FOR UPDATE;
      SELECT * INTO f FROM file_objects WHERE id = NEW.file_id FOR SHARE;
      IF m.id IS NULL OR f.id IS NULL OR f.status <> 'READY' OR f.deleted_at IS NOT NULL OR f.course_unit_id <> m.course_unit_id
        OR (NEW.role = 'INLINE_IMAGE' AND (m.content_type <> 'ARTICLE' OR f.kind IS DISTINCT FROM 'IMAGE'))
        OR (NEW.role = 'ATTACHMENT' AND f.id = m.file_object_id) THEN
        RAISE EXCEPTION 'Invalid material reference' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$`);
    await q.query(
      'CREATE TRIGGER trg_material_reference BEFORE INSERT OR UPDATE ON material_file_references FOR EACH ROW EXECUTE FUNCTION guard_material_reference()',
    );
    await q.query(`CREATE FUNCTION guard_referenced_file() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
          OR NEW.course_unit_id IS DISTINCT FROM OLD.course_unit_id OR NEW.kind IS DISTINCT FROM OLD.kind
          OR NEW.mime_type IS DISTINCT FROM OLD.mime_type OR NEW.object_key IS DISTINCT FROM OLD.object_key
          OR NEW.object_version_id IS DISTINCT FROM OLD.object_version_id OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
          OR NEW.intent_class_id IS DISTINCT FROM OLD.intent_class_id OR NEW.intent_class_unit_id IS DISTINCT FROM OLD.intent_class_unit_id)
        AND (EXISTS (SELECT 1 FROM materials WHERE file_object_id = OLD.id)
          OR EXISTS (SELECT 1 FROM material_file_references WHERE file_id = OLD.id)) THEN
        RAISE EXCEPTION 'Referenced file identity/state is protected' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$`);
    await q.query(
      'CREATE TRIGGER trg_referenced_file BEFORE UPDATE ON file_objects FOR EACH ROW EXECUTE FUNCTION guard_referenced_file()',
    );
    // Structural ancestry is immutable, including unreferenced parents. This avoids
    // reverse-reference write skew without requiring all parent services to import Materials.
    await q.query(`CREATE FUNCTION guard_content_ancestry() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM materials WHERE created_in_class_id = OLD.class_id AND course_unit_id = OLD.course_unit_id) THEN
          RAISE EXCEPTION 'Referenced provenance Class Unit cannot be removed' USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
      END IF;
      IF (TG_TABLE_NAME = 'class_sessions' AND (to_jsonb(NEW)->'class_unit_id') IS DISTINCT FROM (to_jsonb(OLD)->'class_unit_id'))
        OR (TG_TABLE_NAME = 'class_units' AND ((to_jsonb(NEW)->'class_id') IS DISTINCT FROM (to_jsonb(OLD)->'class_id') OR (to_jsonb(NEW)->'course_unit_id') IS DISTINCT FROM (to_jsonb(OLD)->'course_unit_id')))
        OR (TG_TABLE_NAME IN ('classes','course_units') AND (to_jsonb(NEW)->'course_id') IS DISTINCT FROM (to_jsonb(OLD)->'course_id')) THEN
        RAISE EXCEPTION 'Content ancestry is immutable; create a new parent instead' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$`);
    for (const table of ['class_sessions', 'class_units', 'classes', 'course_units'])
      await q.query(
        `CREATE TRIGGER trg_content_ancestry BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION guard_content_ancestry()`,
      );
    await q.query(
      'CREATE TRIGGER trg_content_provenance_delete BEFORE DELETE ON class_units FOR EACH ROW EXECUTE FUNCTION guard_content_ancestry()',
    );
    await q.query(`CREATE FUNCTION guard_material_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Material audit is append-only' USING ERRCODE = '23514'; END $$`);
    await q.query(
      'CREATE TRIGGER trg_material_audit BEFORE UPDATE OR DELETE ON material_audit_events FOR EACH ROW EXECUTE FUNCTION guard_material_audit()',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    // Deliberately refuses a lossy rollback with typed/audit data, even on test DBs.
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM materials WHERE content_type = 'ARTICLE')
      OR EXISTS (SELECT 1 FROM material_file_references) OR EXISTS (SELECT 1 FROM material_audit_events)
      THEN RAISE EXCEPTION 'Typed data exists; roll back app only'; END IF; END $$`);
    for (const table of ['class_sessions', 'class_units', 'classes', 'course_units'])
      await q.query(`DROP TRIGGER trg_content_ancestry ON ${table}`);
    await q.query('DROP TRIGGER trg_content_provenance_delete ON class_units');
    await q.query('DROP TRIGGER trg_material_content ON materials');
    await q.query('DROP TRIGGER trg_referenced_file ON file_objects');
    await q.query('DROP TABLE material_audit_events, material_file_references');
    await q.query(
      'DROP FUNCTION guard_material_audit(), guard_material_reference(), guard_material_content(), guard_referenced_file(), guard_content_ancestry()',
    );
    await q.query('DROP INDEX idx_materials_queue, idx_materials_submissions');
    await q.query(
      'ALTER TABLE materials DROP CONSTRAINT ck_materials_typed_content, DROP COLUMN content_html, DROP COLUMN content_schema_version, ALTER COLUMN file_object_id SET NOT NULL',
    );
    await q.query(
      'ALTER TYPE material_content_type_enum RENAME TO material_content_type_typed_enum',
    );
    await q.query("CREATE TYPE material_content_type_enum AS ENUM ('FILE','VIDEO')");
    await q.query(
      'ALTER TABLE materials ALTER COLUMN content_type TYPE material_content_type_enum USING content_type::text::material_content_type_enum',
    );
    await q.query('DROP TYPE material_content_type_typed_enum');
  }
}
