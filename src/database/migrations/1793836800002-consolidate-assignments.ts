import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserve existing work while removing nine assignment tables (19 -> 10). */
export class ConsolidateAssignments1793836800002 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    if (!q.isTransactionActive) throw new Error('Assignment consolidation requires a transaction');
    await q.query(`LOCK TABLE assignments,assignment_questions,assignment_question_options,
      assignment_answer_keys,assignment_submissions,assignment_zip_submissions,assignment_files,
      assignment_zip_submission_files,assignment_audits,assignment_zip_audits,
      assignment_receipts,assignment_zip_receipts,assignment_zip_grades,assignment_zip_grade_revisions,
      assignment_file_jobs,assignment_file_copies,audit_events,mutation_receipts IN ACCESS EXCLUSIVE MODE`);

    await q.query(`ALTER TABLE assignment_questions ADD COLUMN correct_option varchar(1), ADD COLUMN options jsonb NOT NULL DEFAULT '[]';
      UPDATE assignment_questions q SET correct_option=k.correct_option FROM assignment_answer_keys k WHERE k.question_id=q.id;
      UPDATE assignment_questions q SET options=(SELECT jsonb_agg(jsonb_build_object('label',o.label,'text',o.text) ORDER BY o.label)
        FROM assignment_question_options o WHERE o.question_id=q.id) WHERE EXISTS(SELECT 1 FROM assignment_question_options o WHERE o.question_id=q.id);
      CREATE FUNCTION valid_assignment_options(options jsonb,correct text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN
        IF jsonb_typeof(options) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
        IF jsonb_array_length(options)>4 THEN RETURN false; END IF;
        IF EXISTS(SELECT 1 FROM jsonb_array_elements(options) o WHERE
          jsonb_typeof(o) IS DISTINCT FROM 'object' OR COALESCE(o->>'label','') NOT IN ('A','B','C','D')
          OR jsonb_typeof(o->'text') IS DISTINCT FROM 'string' OR length(trim(o->>'text')) NOT BETWEEN 1 AND 2000) THEN RETURN false; END IF;
        IF (SELECT count(DISTINCT o->>'label') FROM jsonb_array_elements(options) o)<>jsonb_array_length(options) THEN RETURN false; END IF;
        RETURN correct IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(options) o WHERE o->>'label'=correct);
      END $$;
      ALTER TABLE assignment_questions ADD CONSTRAINT ck_question_options CHECK(valid_assignment_options(options,correct_option));
      DROP TABLE assignment_answer_keys;
      DROP TABLE assignment_question_options`);
    // Legacy drafts may have no key yet. Publication already rejects missing keys.
    // Keeping these rows nullable avoids fabricating answers during an upgrade.

    await q.query(`DO $$ DECLARE old_check text; BEGIN
      SELECT pg_get_constraintdef(oid) INTO old_check FROM pg_constraint
        WHERE conrelid='mutation_receipts'::regclass AND conname='ck_receipt_namespace';
      IF old_check IS NULL THEN RAISE EXCEPTION 'System receipt namespace constraint not found'; END IF;
      ALTER TABLE mutation_receipts DROP CONSTRAINT ck_receipt_namespace;
      EXECUTE 'ALTER TABLE mutation_receipts ADD CONSTRAINT ck_receipt_namespace ' ||
        replace(old_check,'CHECK (','CHECK (namespace IN (''assignment_quiz'',''assignment_zip'') OR ');
    END $$;
      INSERT INTO mutation_receipts(namespace,actor_id,route,key,payload_hash,outcome,created_at)
        SELECT 'assignment_quiz',actor_id,route,idempotency_key,request_hash,jsonb_build_object('resourceId',resource_id),created_at FROM assignment_receipts;
      INSERT INTO mutation_receipts(namespace,actor_id,route,key,payload_hash,outcome,created_at)
        SELECT 'assignment_zip',actor_id,route,key,request_hash,outcome,created_at FROM assignment_zip_receipts;
      DROP TABLE assignment_receipts,assignment_zip_receipts`);

    await q.query(`ALTER TABLE assignment_zip_submissions
        ADD COLUMN file_id uuid UNIQUE,
        ADD COLUMN object_version_id text;
      ALTER TABLE assignment_zip_submissions DISABLE TRIGGER trg_zip_submission;
      UPDATE assignment_zip_submissions s SET file_id=f.file_id,object_version_id=f.object_version_id
        FROM assignment_zip_submission_files f WHERE f.submission_id=s.id;
      ALTER TABLE assignment_zip_submissions ENABLE TRIGGER trg_zip_submission;
      ALTER TABLE assignment_zip_submissions ADD CONSTRAINT fk_zip_submission_file
        FOREIGN KEY(file_id,id,assignment_id,student_id)
        REFERENCES assignment_files(id,zip_submission_id,assignment_id,owner_user_id) ON DELETE RESTRICT;
      ALTER TABLE assignment_zip_submissions ADD CONSTRAINT ck_zip_file_version
        CHECK((file_id IS NULL)=(object_version_id IS NULL));
      ALTER TABLE assignment_zip_submissions ADD CONSTRAINT ck_zip_submitted_file
        CHECK(status<>'SUBMITTED' OR file_id IS NOT NULL)`);

    await q.query(`ALTER TABLE assignment_zip_submissions
      ADD COLUMN grade_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
      ADD COLUMN current_version integer NOT NULL DEFAULT 0 CHECK(current_version>=0),
      ADD COLUMN current_revision integer GENERATED ALWAYS AS (NULLIF(current_version,0)) STORED,
      ADD COLUMN released_version integer;
      ALTER TABLE assignment_zip_submissions DISABLE TRIGGER trg_zip_submission;
      UPDATE assignment_zip_submissions s SET grade_id=g.id,current_version=g.current_version,released_version=g.released_version
        FROM assignment_zip_grades g WHERE g.submission_id=s.id;
      ALTER TABLE assignment_zip_submissions ENABLE TRIGGER trg_zip_submission;
      ALTER TABLE assignment_zip_submissions ADD CONSTRAINT ck_zip_grade_release
        CHECK(released_version IS NULL OR (released_version>0 AND released_version<=current_version));
      ALTER TABLE assignment_zip_submissions ADD CONSTRAINT ck_zip_grade_submitted
        CHECK(status='SUBMITTED' OR (current_version=0 AND released_version IS NULL));
      ALTER TABLE assignment_zip_grade_revisions DROP CONSTRAINT assignment_zip_grade_revisions_grade_id_fkey;
      ALTER TABLE assignment_zip_grade_revisions ADD CONSTRAINT fk_zip_revision_submission
        FOREIGN KEY(grade_id) REFERENCES assignment_zip_submissions(grade_id) ON DELETE RESTRICT;
      ALTER TABLE assignment_zip_submissions ADD CONSTRAINT fk_zip_grade_current
        FOREIGN KEY(grade_id,current_revision) REFERENCES assignment_zip_grade_revisions(grade_id,version) DEFERRABLE INITIALLY DEFERRED;
      ALTER TABLE assignment_zip_submissions ADD CONSTRAINT fk_zip_grade_release
        FOREIGN KEY(grade_id,released_version) REFERENCES assignment_zip_grade_revisions(grade_id,version) DEFERRABLE INITIALLY DEFERRED;
      CREATE OR REPLACE FUNCTION guard_zip_grade_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM assignment_zip_submissions s WHERE s.grade_id=NEW.grade_id
          AND s.status='SUBMITTED' AND NEW.score<=(s.assignment_snapshot->>'maxScore')::numeric) THEN
          RAISE EXCEPTION 'Grade exceeds submitted max score or scope' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`);

    await q.query(`CREATE OR REPLACE FUNCTION protect_zip_submission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ZIP terminal history is immutable' USING ERRCODE='23514'; END IF;
      IF OLD.status<>'DRAFT' THEN
        IF OLD.status='SUBMITTED'
          AND (NEW.current_version,NEW.released_version) IS DISTINCT FROM (OLD.current_version,OLD.released_version)
          AND (to_jsonb(NEW)-ARRAY['current_version','current_revision','released_version'])=
            (to_jsonb(OLD)-ARRAY['current_version','current_revision','released_version']) THEN RETURN NEW; END IF;
        RAISE EXCEPTION 'ZIP terminal history is immutable' USING ERRCODE='23514';
      END IF;
      IF (NEW.id,NEW.assignment_id,NEW.student_id,NEW.enrollment_id,NEW.created_at,NEW.grade_id) IS DISTINCT FROM
        (OLD.id,OLD.assignment_id,OLD.student_id,OLD.enrollment_id,OLD.created_at,OLD.grade_id) THEN
        RAISE EXCEPTION 'ZIP identity is immutable' USING ERRCODE='23514'; END IF;
      IF NEW.file_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assignment_files f
        WHERE f.id=NEW.file_id AND f.zip_submission_id=NEW.id AND f.assignment_id=NEW.assignment_id
          AND f.owner_user_id=NEW.student_id AND f.status='READY' AND f.object_version_id=NEW.object_version_id) THEN
        RAISE EXCEPTION 'File is not ready or version mismatch' USING ERRCODE='23514'; END IF;
      IF NEW.status='SUBMITTED' AND NEW.file_id IS NULL THEN
        RAISE EXCEPTION 'ZIP requires a file' USING ERRCODE='23514'; END IF;
      RETURN NEW; END $$`);
    // guard_zip_insert already validates enrollment/type; the new binding must
    // also be checked on INSERT, since FK checks alone do not enforce READY.
    const inserts: { definition: string }[] = await q.query(
      "SELECT pg_get_functiondef('guard_zip_insert()'::regprocedure) AS definition",
    );
    const insert = inserts[0]?.definition;
    if (!insert?.includes('RETURN NEW;')) throw new Error('ZIP insert guard not found');
    await q.query(
      insert.replace(
        'RETURN NEW;',
        `
      IF NEW.file_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assignment_files f
        WHERE f.id=NEW.file_id AND f.zip_submission_id=NEW.id AND f.assignment_id=NEW.assignment_id
          AND f.owner_user_id=NEW.student_id AND f.status='READY' AND f.object_version_id=NEW.object_version_id) THEN
        RAISE EXCEPTION 'File is not ready or version mismatch' USING ERRCODE='23514'; END IF;
      RETURN NEW;`,
      ),
    );

    const guards: { definition: string }[] = await q.query(
      "SELECT pg_get_functiondef('protect_assignment_file()'::regprocedure) AS definition",
    );
    const guard = guards[0]?.definition;
    const oldBinding =
      "EXISTS(SELECT 1 FROM assignment_zip_submission_files b JOIN assignment_zip_submissions s ON s.id=b.submission_id WHERE b.file_id=OLD.id AND s.status IN ('DRAFT','SUBMITTED'))";
    if (!guard?.includes(oldBinding)) throw new Error('Assignment file retention guard not found');
    await q.query(
      guard.replace(
        oldBinding,
        "EXISTS(SELECT 1 FROM assignment_zip_submissions s WHERE s.file_id=OLD.id AND s.status IN ('DRAFT','SUBMITTED'))",
      ),
    );
    await q.query('DROP TABLE assignment_zip_submission_files');

    // Extend the existing source allowlist without removing other modules' sources.
    await q.query(`DO $$ DECLARE old_check text; BEGIN
      SELECT pg_get_constraintdef(oid) INTO old_check FROM pg_constraint
        WHERE conrelid='audit_events'::regclass AND conname='ck_audit_source';
      IF old_check IS NULL THEN RAISE EXCEPTION 'System audit source constraint not found'; END IF;
      ALTER TABLE audit_events DROP CONSTRAINT ck_audit_source;
      EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT ck_audit_source ' ||
        replace(old_check,'CHECK (','CHECK (source IN (''assignment_audits'',''assignment_zip_audits'') OR ');
    END $$`);
    // Generated typed references retain real FKs, including parent-side DELETE protection.
    await q.query(`ALTER TABLE audit_events
      ADD COLUMN ref_assignment_id uuid GENERATED ALWAYS AS
        (CASE WHEN source IN ('assignment_audits','assignment_zip_audits') THEN (data->>'assignment_id')::uuid END) STORED
        REFERENCES assignments(id) ON DELETE RESTRICT,
      ADD COLUMN ref_assignment_quiz_submission_id uuid GENERATED ALWAYS AS
        (CASE WHEN source='assignment_audits' THEN (data->>'submission_id')::uuid END) STORED
        REFERENCES assignment_submissions(id) ON DELETE RESTRICT,
      ADD COLUMN ref_assignment_zip_submission_id uuid GENERATED ALWAYS AS
        (CASE WHEN source='assignment_zip_audits' THEN (data->>'submission_id')::uuid END) STORED
        REFERENCES assignment_zip_submissions(id) ON DELETE RESTRICT,
      ADD COLUMN ref_assignment_zip_grade_id uuid GENERATED ALWAYS AS
        (CASE WHEN source='assignment_zip_audits' THEN (data->>'grade_id')::uuid END) STORED
        REFERENCES assignment_zip_submissions(grade_id) ON DELETE RESTRICT;
      ALTER TABLE audit_events ADD CONSTRAINT ck_assignment_audit_fields
        CHECK(source NOT IN ('assignment_audits','assignment_zip_audits') OR
          (ref_assignment_id IS NOT NULL AND data->>'action' IS NOT NULL
            AND (data->>'version')::integer IS NOT NULL AND (data->>'version')::integer>0
            AND length(data->>'reason')<=2000 IS NOT FALSE));
      INSERT INTO audit_events(source,id,actor_id,occurred_at,data)
        SELECT 'assignment_audits',id,actor_id,created_at,to_jsonb(a) FROM assignment_audits a;
      INSERT INTO audit_events(source,id,actor_id,occurred_at,data)
        SELECT 'assignment_zip_audits',id,actor_id,created_at,to_jsonb(a) FROM assignment_zip_audits a;
      CREATE INDEX idx_audit_assignment_history ON audit_events(ref_assignment_id,occurred_at,id)
        WHERE source IN ('assignment_audits','assignment_zip_audits');
      CREATE INDEX idx_audit_assignment_submission_history ON audit_events(source,((data->>'submission_id')::uuid),occurred_at DESC,id)
        WHERE source IN ('assignment_audits','assignment_zip_audits');
      DROP TABLE assignment_audits,assignment_zip_audits;
      DROP TABLE assignment_zip_grades`);

    await q.query(`ALTER TABLE assignment_file_jobs ADD COLUMN copy_candidates jsonb NOT NULL DEFAULT '[]'
        CHECK(jsonb_typeof(copy_candidates)='array');
      INSERT INTO assignment_file_jobs(file_id,kind,status)
        SELECT DISTINCT file_id,'VALIDATE','DONE' FROM assignment_file_copies ON CONFLICT(file_id,kind) DO NOTHING;
      UPDATE assignment_file_jobs j SET copy_candidates=c.copies FROM
        (SELECT file_id,jsonb_agg(jsonb_build_object('token',token,'object_key',object_key) ORDER BY token) AS copies
          FROM assignment_file_copies GROUP BY file_id) c WHERE j.file_id=c.file_id AND j.kind='VALIDATE';
      DROP TABLE assignment_file_copies`);
  }

  async down(): Promise<void> {
    // The old application writes removed tables. Never imply it can be deployed
    // over the consolidated schema, or silently remove newly recorded history.
    throw new Error(
      'Assignment consolidation requires a forward migration; restore a database backup with the matching application to revert',
    );
  }
}
