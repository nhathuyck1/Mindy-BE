import type { MigrationInterface, QueryRunner } from 'typeorm';
export class PrivateFileUploads1791504000001 implements MigrationInterface {
  name = 'PrivateFileUploads1791504000001';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE file_status_enum AS ENUM ('PENDING_UPLOAD','PROCESSING','READY','FAILED','DELETED')`,
    );
    await q.query(
      `ALTER TABLE class_units ADD CONSTRAINT uq_class_units_file_context UNIQUE(id, class_id, course_unit_id)`,
    );
    await q.query(`CREATE TABLE file_objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      course_unit_id uuid NOT NULL REFERENCES course_units(id) ON DELETE RESTRICT,
      intent_class_id uuid REFERENCES classes(id) ON DELETE RESTRICT, intent_class_unit_id uuid,
      bucket varchar(100) NOT NULL, staging_key varchar(1024) NOT NULL, staging_version_id varchar(1024),
      object_key varchar(1024), object_version_id varchar(1024), original_name varchar(250) NOT NULL, extension varchar(20) NOT NULL,
      declared_mime_type varchar(150) NOT NULL, declared_size_bytes bigint NOT NULL CHECK(declared_size_bytes > 0 AND declared_size_bytes <= 209715200),
      mime_type varchar(150), size_bytes bigint CHECK(size_bytes > 0 AND size_bytes <= 209715200), kind varchar(30), sha256 char(64),
      status file_status_enum NOT NULL DEFAULT 'PENDING_UPLOAD', intent_expires_at timestamptz NOT NULL,
      processing_at timestamptz, ready_at timestamptz, deleted_at timestamptz, error_code varchar(80),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_files_staging UNIQUE(bucket, staging_key), CONSTRAINT uq_files_final UNIQUE(bucket, object_key),
      CONSTRAINT fk_files_class_context FOREIGN KEY(intent_class_unit_id,intent_class_id,course_unit_id) REFERENCES class_units(id,class_id,course_unit_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT ck_files_context CHECK((intent_class_id IS NULL) = (intent_class_unit_id IS NULL)),
      CONSTRAINT ck_files_kind CHECK(kind IS NULL OR kind IN ('PDF','IMAGE','DOCUMENT','PRESENTATION','SPREADSHEET','AUDIO','VIDEO','SOURCE_CODE')),
      CONSTRAINT ck_files_ready CHECK(status <> 'READY' OR (mime_type IS NOT NULL AND size_bytes IS NOT NULL AND size_bytes = declared_size_bytes AND kind IS NOT NULL AND sha256 IS NOT NULL AND sha256 ~ '^[a-f0-9]{64}$' AND object_key IS NOT NULL AND object_version_id IS NOT NULL AND object_version_id NOT IN ('null','') AND staging_version_id IS NOT NULL AND ready_at IS NOT NULL))
    )`);
    await q.query(`CREATE INDEX idx_files_owner_created ON file_objects(owner_user_id,created_at)`);
    await q.query(`CREATE INDEX idx_files_scope ON file_objects(course_unit_id,status)`);
    await q.query(
      `CREATE INDEX idx_files_expiry ON file_objects(intent_expires_at) WHERE status = 'PENDING_UPLOAD'`,
    );
    await q.query(`CREATE TABLE file_metadata (
      file_object_id uuid PRIMARY KEY REFERENCES file_objects(id) ON DELETE RESTRICT,
      processing_status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(processing_status IN ('PENDING','PROCESSING','READY','FAILED')),
      duration_ms bigint CHECK(duration_ms >= 0), width_px integer CHECK(width_px > 0), height_px integer CHECK(height_px > 0),
      page_count integer CHECK(page_count >= 0), slide_count integer CHECK(slide_count >= 0), sheet_count integer CHECK(sheet_count >= 0), word_count bigint CHECK(word_count >= 0),
      video_codec varchar(50), audio_codec varchar(50), bitrate_kbps integer CHECK(bitrate_kbps >= 0), frame_rate numeric(8,3) CHECK(frame_rate > 0),
      preview_file_id uuid REFERENCES file_objects(id) ON DELETE RESTRICT, properties jsonb NOT NULL DEFAULT '{}' CHECK(octet_length(properties::text) <= 1048576),
      processing_error text, extracted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_file_metadata_status ON file_metadata(processing_status)`);
    await q.query(`CREATE INDEX idx_file_metadata_preview ON file_metadata(preview_file_id)`);
    await q.query(`CREATE TABLE file_processing_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_object_id uuid NOT NULL REFERENCES file_objects(id) ON DELETE RESTRICT,
      kind varchar(20) NOT NULL CHECK(kind IN ('VALIDATE','EXTRACT','PURGE')),
      status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED')),
      attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0), max_attempts integer NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 20 AND attempts <= max_attempts),
      available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
      copy_candidates jsonb NOT NULL DEFAULT '[]', error_code varchar(80), completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_file_job UNIQUE(file_object_id,kind),
      CONSTRAINT ck_job_lease CHECK(status <> 'PROCESSING' OR (lease_token IS NOT NULL AND lease_until IS NOT NULL)),
      CONSTRAINT ck_job_candidates CHECK(jsonb_typeof(copy_candidates) = 'array' AND jsonb_array_length(copy_candidates) <= max_attempts)
    )`);
    await q.query(
      `CREATE INDEX idx_file_jobs_claim ON file_processing_jobs(kind,status,available_at)`,
    );
    await q.query(
      `CREATE INDEX idx_file_jobs_lease ON file_processing_jobs(lease_until) WHERE status = 'PROCESSING'`,
    );
    await q.query(`CREATE FUNCTION protect_file_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF (NEW.owner_user_id,NEW.course_unit_id,NEW.intent_class_id,NEW.intent_class_unit_id,NEW.bucket,NEW.staging_key,NEW.original_name,NEW.extension,NEW.declared_mime_type,NEW.declared_size_bytes,NEW.intent_expires_at)
        IS DISTINCT FROM (OLD.owner_user_id,OLD.course_unit_id,OLD.intent_class_id,OLD.intent_class_unit_id,OLD.bucket,OLD.staging_key,OLD.original_name,OLD.extension,OLD.declared_mime_type,OLD.declared_size_bytes,OLD.intent_expires_at)
        THEN RAISE EXCEPTION 'File identity is immutable' USING ERRCODE='23514'; END IF;
      IF OLD.staging_version_id IS NOT NULL AND NEW.staging_version_id IS DISTINCT FROM OLD.staging_version_id
        THEN RAISE EXCEPTION 'Pinned staging version is immutable' USING ERRCODE='23514'; END IF;
      IF OLD.ready_at IS NOT NULL AND (NEW.object_key,NEW.object_version_id,NEW.sha256,NEW.size_bytes,NEW.mime_type,NEW.kind,NEW.ready_at)
        IS DISTINCT FROM (OLD.object_key,OLD.object_version_id,OLD.sha256,OLD.size_bytes,OLD.mime_type,OLD.kind,OLD.ready_at)
        THEN RAISE EXCEPTION 'Verified file version is immutable' USING ERRCODE='23514'; END IF;
      RETURN NEW; END $$`);
    await q.query(
      `CREATE TRIGGER file_identity_immutable BEFORE UPDATE ON file_objects FOR EACH ROW EXECUTE FUNCTION protect_file_identity()`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE file_processing_jobs');
    await q.query('DROP TABLE file_metadata');
    await q.query('DROP TABLE file_objects');
    await q.query('DROP FUNCTION protect_file_identity()');
    await q.query('ALTER TABLE class_units DROP CONSTRAINT uq_class_units_file_context');
    await q.query('DROP TYPE file_status_enum');
  }
}
