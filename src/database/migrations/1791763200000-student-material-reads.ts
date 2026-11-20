import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentMaterialReads1791763200000 implements MigrationInterface {
  name = 'StudentMaterialReads1791763200000';
  async up(q: QueryRunner): Promise<void> {
    await q.query("CREATE TYPE material_content_type_enum AS ENUM ('FILE','VIDEO')");
    await q.query(
      "CREATE TYPE material_review_status_enum AS ENUM ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED')",
    );
    await q.query(`CREATE TABLE materials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_unit_id uuid NOT NULL REFERENCES course_units(id) ON DELETE RESTRICT,
      file_object_id uuid NOT NULL REFERENCES file_objects(id) ON DELETE RESTRICT,
      content_type material_content_type_enum NOT NULL,
      title varchar(250) NOT NULL CHECK(length(btrim(title)) > 0), description varchar(5000),
      sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order >= 0), available_at timestamptz,
      session_id uuid REFERENCES class_sessions(id) ON DELETE RESTRICT,
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_in_class_id uuid REFERENCES classes(id) ON DELETE RESTRICT,
      revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
      review_status material_review_status_enum NOT NULL DEFAULT 'DRAFT', approved_revision integer,
      reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT, reviewed_at timestamptz,
      first_approved_at timestamptz, rejection_reason varchar(2000), published_at timestamptz, deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_materials_approval CHECK(review_status <> 'APPROVED' OR
        (approved_revision IS NOT NULL AND approved_revision = revision AND reviewed_by IS NOT NULL
         AND reviewed_at IS NOT NULL AND first_approved_at IS NOT NULL)),
      CONSTRAINT ck_materials_publication CHECK(published_at IS NULL OR
        (review_status = 'APPROVED' AND approved_revision IS NOT NULL AND approved_revision = revision)),
      CONSTRAINT ck_materials_deletion CHECK(deleted_at IS NULL OR published_at IS NULL),
      CONSTRAINT ck_materials_rejection CHECK(review_status <> 'REJECTED' OR
        (rejection_reason IS NOT NULL AND length(btrim(rejection_reason)) > 0 AND published_at IS NULL))
    )`);
    await q.query(
      'CREATE INDEX idx_materials_unit_live ON materials(course_unit_id,sort_order,id) WHERE deleted_at IS NULL',
    );
    await q.query('CREATE INDEX idx_materials_file ON materials(file_object_id)');
    await q.query('CREATE INDEX idx_materials_session ON materials(session_id)');
    await q.query('CREATE INDEX idx_materials_provenance ON materials(created_in_class_id)');
    await q.query('CREATE INDEX idx_materials_creator ON materials(created_by)');
    await q.query('CREATE INDEX idx_materials_reviewer ON materials(reviewed_by)');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE materials');
    await q.query('DROP TYPE material_review_status_enum');
    await q.query('DROP TYPE material_content_type_enum');
  }
}
