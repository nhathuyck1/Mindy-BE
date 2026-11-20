import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Independent ZIP persistence: existing QUIZ tables/triggers are intentionally untouched. */
export class AssignmentZip1793577600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE assignment_zip_submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
        student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
        status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','VOIDED')),
        attempt_number integer CHECK(attempt_number BETWEEN 1 AND 10), version integer NOT NULL DEFAULT 1 CHECK(version>0),
        assignment_revision integer, assignment_snapshot jsonb, submitted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(id,assignment_id,student_id), UNIQUE(assignment_id,student_id,attempt_number),
        CHECK((status='SUBMITTED' AND attempt_number IS NOT NULL AND submitted_at IS NOT NULL AND assignment_revision IS NOT NULL AND assignment_snapshot IS NOT NULL)
          OR (status<>'SUBMITTED' AND attempt_number IS NULL AND submitted_at IS NULL AND assignment_revision IS NULL AND assignment_snapshot IS NULL)));
      CREATE UNIQUE INDEX uq_assignment_zip_draft ON assignment_zip_submissions(assignment_id,student_id) WHERE status='DRAFT';
      CREATE INDEX idx_zip_student_history ON assignment_zip_submissions(student_id,assignment_id,attempt_number DESC);
      CREATE TABLE assignment_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
        owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, zip_submission_id uuid,
        purpose text NOT NULL CHECK(purpose IN ('INSTRUCTION','SUBMISSION')),
        original_name varchar(250) NOT NULL, declared_mime_type varchar(150) NOT NULL,
        declared_size_bytes integer NOT NULL CHECK(declared_size_bytes BETWEEN 1 AND 26214400),
        bucket text NOT NULL, staging_key text NOT NULL UNIQUE, staging_version_id text,
        object_key text, object_version_id text, mime_type text, size_bytes integer,
        status text NOT NULL DEFAULT 'PENDING_UPLOAD' CHECK(status IN ('PENDING_UPLOAD','PROCESSING','READY','FAILED','DELETING','DELETED')), version integer NOT NULL DEFAULT 1 CHECK(version>0),
        intent_expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), ready_at timestamptz, error_code text,
        FOREIGN KEY(zip_submission_id,assignment_id,owner_user_id) REFERENCES assignment_zip_submissions(id,assignment_id,student_id) ON DELETE RESTRICT,
        CHECK((purpose='INSTRUCTION' AND zip_submission_id IS NULL) OR (purpose='SUBMISSION' AND zip_submission_id IS NOT NULL AND declared_size_bytes<=20971520)),
        CHECK(status<>'READY' OR (object_key IS NOT NULL AND object_version_id IS NOT NULL AND mime_type IS NOT NULL AND size_bytes=declared_size_bytes AND ready_at IS NOT NULL)),
        UNIQUE(id,assignment_id,purpose), UNIQUE(id,zip_submission_id,assignment_id,owner_user_id));
      CREATE INDEX idx_assignment_files_owner ON assignment_files(owner_user_id,status,created_at);
      CREATE TABLE assignment_instruction_files (
        assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
        file_id uuid NOT NULL UNIQUE, purpose text NOT NULL DEFAULT 'INSTRUCTION' CHECK(purpose='INSTRUCTION'),
        position integer NOT NULL CHECK(position BETWEEN 1 AND 5), PRIMARY KEY(assignment_id,position),
        FOREIGN KEY(file_id,assignment_id,purpose) REFERENCES assignment_files(id,assignment_id,purpose) ON DELETE RESTRICT);
      CREATE TABLE assignment_zip_submission_files (
        submission_id uuid PRIMARY KEY, assignment_id uuid NOT NULL, student_id uuid NOT NULL, file_id uuid NOT NULL UNIQUE,
        object_version_id text NOT NULL,
        FOREIGN KEY(submission_id,assignment_id,student_id) REFERENCES assignment_zip_submissions(id,assignment_id,student_id) ON DELETE RESTRICT,
        FOREIGN KEY(file_id,submission_id,assignment_id,student_id) REFERENCES assignment_files(id,zip_submission_id,assignment_id,owner_user_id) ON DELETE RESTRICT);
      CREATE TABLE assignment_zip_instruction_snapshots (
        submission_id uuid NOT NULL REFERENCES assignment_zip_submissions(id) ON DELETE RESTRICT,
        file_id uuid NOT NULL REFERENCES assignment_files(id) ON DELETE RESTRICT, object_version_id text NOT NULL,
        position integer NOT NULL CHECK(position BETWEEN 1 AND 5), PRIMARY KEY(submission_id,position));
      CREATE TABLE assignment_zip_grades (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL UNIQUE REFERENCES assignment_zip_submissions(id) ON DELETE RESTRICT,
        current_version integer NOT NULL DEFAULT 0 CHECK(current_version>=0), current_revision integer GENERATED ALWAYS AS (NULLIF(current_version,0)) STORED, released_version integer,
        CHECK(released_version IS NULL OR (released_version>0 AND released_version<=current_version)));
      CREATE TABLE assignment_zip_grade_revisions (
        grade_id uuid NOT NULL REFERENCES assignment_zip_grades(id) ON DELETE RESTRICT,
        version integer NOT NULL CHECK(version>0), score numeric(8,2) NOT NULL CHECK(score>=0), feedback varchar(10000) NOT NULL,
        actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, reason varchar(2000),
        created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(grade_id,version), CHECK(version=1 OR (reason IS NOT NULL AND length(trim(reason))>0)));
      ALTER TABLE assignment_zip_grades ADD CONSTRAINT fk_zip_grade_release FOREIGN KEY(id,released_version)
        REFERENCES assignment_zip_grade_revisions(grade_id,version) DEFERRABLE INITIALLY DEFERRED;
      ALTER TABLE assignment_zip_grades ADD CONSTRAINT fk_zip_grade_current FOREIGN KEY(id,current_revision)
        REFERENCES assignment_zip_grade_revisions(grade_id,version) DEFERRABLE INITIALLY DEFERRED;
      CREATE TABLE assignment_zip_audits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
        submission_id uuid REFERENCES assignment_zip_submissions(id) ON DELETE RESTRICT,
        grade_id uuid REFERENCES assignment_zip_grades(id) ON DELETE RESTRICT,
        actor_id uuid REFERENCES users(id) ON DELETE RESTRICT, action text NOT NULL, version integer NOT NULL CHECK(version>0),
        reason varchar(2000), created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX idx_zip_audits_assignment ON assignment_zip_audits(assignment_id,created_at,id);
      CREATE TABLE assignment_zip_receipts (
        actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, route text NOT NULL, key uuid NOT NULL,
        request_hash text NOT NULL, outcome jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,route,key));
      CREATE TABLE assignment_file_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_id uuid NOT NULL REFERENCES assignment_files(id) ON DELETE RESTRICT,
        kind text NOT NULL CHECK(kind IN ('VALIDATE','CLEANUP')), status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','DONE','FAILED')),
        attempts integer NOT NULL DEFAULT 0, lease_token uuid, lease_until timestamptz, run_after timestamptz NOT NULL DEFAULT now(),
        error_code text, UNIQUE(file_id,kind));
      CREATE INDEX idx_assignment_file_jobs_due ON assignment_file_jobs(run_after) WHERE status IN ('PENDING','RUNNING');
      CREATE TABLE assignment_file_copies (
        file_id uuid NOT NULL REFERENCES assignment_files(id) ON DELETE RESTRICT, token uuid NOT NULL, object_key text NOT NULL UNIQUE,
        PRIMARY KEY(file_id,token));
      CREATE FUNCTION protect_zip_submission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF TG_OP='DELETE' OR OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'ZIP terminal history is immutable' USING ERRCODE='23514'; END IF;
        IF (NEW.id,NEW.assignment_id,NEW.student_id,NEW.enrollment_id,NEW.created_at) IS DISTINCT FROM
          (OLD.id,OLD.assignment_id,OLD.student_id,OLD.enrollment_id,OLD.created_at) THEN RAISE EXCEPTION 'ZIP identity is immutable' USING ERRCODE='23514'; END IF;
        IF NEW.status='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM assignment_zip_submission_files WHERE submission_id=NEW.id) THEN
          RAISE EXCEPTION 'ZIP requires a file' USING ERRCODE='23514'; END IF;
        RETURN NEW; END $$;
      CREATE TRIGGER trg_zip_submission BEFORE UPDATE OR DELETE ON assignment_zip_submissions FOR EACH ROW EXECUTE FUNCTION protect_zip_submission();
      CREATE FUNCTION guard_zip_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'ZIP starts as a draft' USING ERRCODE='23514'; END IF;
        IF NOT EXISTS(SELECT 1 FROM assignments a JOIN class_sessions s ON s.id=a.session_id JOIN enrollments e ON e.class_id=s.class_id
          WHERE a.id=NEW.assignment_id AND a.type='ZIP' AND e.id=NEW.enrollment_id AND e.student_id=NEW.student_id) THEN
          RAISE EXCEPTION 'ZIP enrollment scope mismatch' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER trg_zip_insert BEFORE INSERT ON assignment_zip_submissions FOR EACH ROW EXECUTE FUNCTION guard_zip_insert();
      CREATE FUNCTION guard_assignment_file_binding() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE f assignment_files; st text; BEGIN
        IF TG_TABLE_NAME='assignment_instruction_files' THEN
          SELECT status INTO st FROM assignments WHERE id=COALESCE(NEW.assignment_id,OLD.assignment_id) FOR UPDATE;
          IF st<>'DRAFT' THEN RAISE EXCEPTION 'Published instructions are immutable' USING ERRCODE='23514'; END IF;
        ELSE
          SELECT status INTO st FROM assignment_zip_submissions WHERE id=COALESCE(NEW.submission_id,OLD.submission_id) FOR UPDATE;
          IF st<>'DRAFT' THEN RAISE EXCEPTION 'Submitted files are immutable' USING ERRCODE='23514'; END IF;
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        SELECT * INTO f FROM assignment_files WHERE id=NEW.file_id;
        IF f.status IS DISTINCT FROM 'READY' THEN RAISE EXCEPTION 'File is not ready' USING ERRCODE='23514'; END IF;
        IF TG_TABLE_NAME='assignment_zip_submission_files' THEN IF f.object_version_id IS DISTINCT FROM NEW.object_version_id THEN
          RAISE EXCEPTION 'File version mismatch' USING ERRCODE='23514'; END IF; END IF; RETURN NEW; END $$;
      CREATE TRIGGER trg_instruction_binding BEFORE INSERT OR UPDATE OR DELETE ON assignment_instruction_files FOR EACH ROW EXECUTE FUNCTION guard_assignment_file_binding();
      CREATE TRIGGER trg_zip_file_binding BEFORE INSERT OR UPDATE OR DELETE ON assignment_zip_submission_files FOR EACH ROW EXECUTE FUNCTION guard_assignment_file_binding();
      CREATE FUNCTION protect_assignment_file() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF (NEW.id,NEW.assignment_id,NEW.owner_user_id,NEW.zip_submission_id,NEW.purpose,NEW.original_name,NEW.declared_mime_type,
          NEW.declared_size_bytes,NEW.bucket,NEW.staging_key,NEW.intent_expires_at) IS DISTINCT FROM
          (OLD.id,OLD.assignment_id,OLD.owner_user_id,OLD.zip_submission_id,OLD.purpose,OLD.original_name,OLD.declared_mime_type,
          OLD.declared_size_bytes,OLD.bucket,OLD.staging_key,OLD.intent_expires_at) THEN RAISE EXCEPTION 'Assignment file identity is immutable' USING ERRCODE='23514'; END IF;
        IF OLD.staging_version_id IS NOT NULL AND NEW.staging_version_id IS DISTINCT FROM OLD.staging_version_id THEN
          RAISE EXCEPTION 'Upload version is immutable' USING ERRCODE='23514'; END IF;
        IF OLD.ready_at IS NOT NULL AND (NEW.object_key,NEW.object_version_id,NEW.mime_type,NEW.size_bytes,NEW.ready_at) IS DISTINCT FROM
          (OLD.object_key,OLD.object_version_id,OLD.mime_type,OLD.size_bytes,OLD.ready_at) THEN RAISE EXCEPTION 'Verified bytes are immutable' USING ERRCODE='23514'; END IF;
        IF NEW.status IN ('DELETING','DELETED') AND (
          EXISTS(SELECT 1 FROM assignment_instruction_files WHERE file_id=OLD.id) OR EXISTS(SELECT 1 FROM assignment_zip_instruction_snapshots WHERE file_id=OLD.id) OR
          EXISTS(SELECT 1 FROM assignment_zip_submission_files b JOIN assignment_zip_submissions s ON s.id=b.submission_id WHERE b.file_id=OLD.id AND s.status IN ('DRAFT','SUBMITTED')))
          THEN RAISE EXCEPTION 'Referenced assignment bytes must be retained' USING ERRCODE='23514'; END IF;
        RETURN NEW; END $$;
      CREATE TRIGGER trg_assignment_file_identity BEFORE UPDATE ON assignment_files FOR EACH ROW EXECUTE FUNCTION protect_assignment_file();
      CREATE FUNCTION guard_zip_grade_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM assignment_zip_grades g JOIN assignment_zip_submissions s ON s.id=g.submission_id
          WHERE g.id=NEW.grade_id AND s.status='SUBMITTED' AND NEW.score<=(s.assignment_snapshot->>'maxScore')::numeric) THEN
          RAISE EXCEPTION 'Grade exceeds submitted max score or scope' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER trg_zip_grade_range BEFORE INSERT ON assignment_zip_grade_revisions FOR EACH ROW EXECUTE FUNCTION guard_zip_grade_revision();
      CREATE TRIGGER trg_zip_grade_revision_immutable BEFORE UPDATE OR DELETE ON assignment_zip_grade_revisions FOR EACH ROW EXECUTE FUNCTION reject_assignment_audit_mutation();
      CREATE TRIGGER trg_zip_audit_immutable BEFORE UPDATE OR DELETE ON assignment_zip_audits FOR EACH ROW EXECUTE FUNCTION reject_assignment_audit_mutation();
      CREATE TRIGGER trg_zip_receipt_immutable BEFORE UPDATE OR DELETE ON assignment_zip_receipts FOR EACH ROW EXECUTE FUNCTION reject_assignment_audit_mutation();
      CREATE TRIGGER trg_zip_snapshot_immutable BEFORE UPDATE OR DELETE ON assignment_zip_instruction_snapshots FOR EACH ROW EXECUTE FUNCTION reject_assignment_audit_mutation();
      CREATE FUNCTION guard_zip_instruction_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM assignment_zip_submissions s JOIN assignment_instruction_files i ON i.assignment_id=s.assignment_id
          JOIN assignment_files f ON f.id=i.file_id WHERE s.id=NEW.submission_id AND s.status='DRAFT' AND i.position=NEW.position
          AND f.id=NEW.file_id AND f.status='READY' AND f.object_version_id=NEW.object_version_id) THEN
          RAISE EXCEPTION 'Instruction snapshot scope/version mismatch' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER trg_zip_snapshot_scope BEFORE INSERT ON assignment_zip_instruction_snapshots FOR EACH ROW EXECUTE FUNCTION guard_zip_instruction_snapshot();
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM assignment_zip_submissions) OR EXISTS(SELECT 1 FROM assignment_files) OR EXISTS(SELECT 1 FROM assignment_zip_audits) THEN
      RAISE EXCEPTION 'Export ZIP history; disable feature and retain schema'; END IF; END $$;
      DROP TABLE assignment_file_copies,assignment_file_jobs,assignment_zip_receipts,assignment_zip_audits;
      ALTER TABLE assignment_zip_grades DROP CONSTRAINT fk_zip_grade_release,DROP CONSTRAINT fk_zip_grade_current;
      DROP TABLE assignment_zip_grade_revisions,assignment_zip_grades,assignment_zip_instruction_snapshots,assignment_zip_submission_files,assignment_instruction_files,assignment_files,assignment_zip_submissions;
      DROP FUNCTION protect_zip_submission(),guard_zip_insert(),guard_assignment_file_binding(),protect_assignment_file(),guard_zip_grade_revision(),guard_zip_instruction_snapshot();`);
  }
}
