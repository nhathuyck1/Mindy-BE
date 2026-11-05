import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7 — CODE assignments (LeetCode-style functions judged by compiler-runner).
 * Additive: adds type CODE to assignments and new code_* tables. Quiz/ZIP data is untouched.
 */
export class CodeAssignments1792886400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // The Phase 5 CHECKs are unnamed inline constraints; find them by definition, then recreate named.
    await q.query(`DO $$
      DECLARE r record; dropped integer := 0;
      BEGIN
        FOR r IN SELECT conname FROM pg_constraint
          WHERE conrelid = 'assignments'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) ~ '(max_attempts|''QUIZ'')'
        LOOP
          EXECUTE format('ALTER TABLE assignments DROP CONSTRAINT %I', r.conname);
          dropped := dropped + 1;
        END LOOP;
        IF dropped <> 3 THEN
          RAISE EXCEPTION 'Expected 3 assignment type/attempt constraints, found %', dropped;
        END IF;
      END $$`);
    await q.query(
      "ALTER TABLE assignments ADD CONSTRAINT ck_assignments_type CHECK (type IN ('QUIZ','ZIP','CODE'))",
    );
    await q.query(`ALTER TABLE assignments ADD CONSTRAINT ck_assignments_max_attempts CHECK (
      (type <> 'CODE' AND max_attempts BETWEEN 1 AND 10) OR (type = 'CODE' AND max_attempts BETWEEN 1 AND 50))`);
    await q.query(`ALTER TABLE assignments ADD CONSTRAINT ck_assignments_type_rules CHECK (
      (type = 'QUIZ' AND max_attempts = 1)
      OR (type = 'ZIP' AND time_limit_minutes IS NULL AND due_at IS NOT NULL)
      OR (type = 'CODE' AND time_limit_minutes IS NULL AND due_at IS NOT NULL))`);

    await q.query(`CREATE TABLE code_languages (
      key varchar(20) PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+$'),
      display_name varchar(50) NOT NULL,
      runtime_version varchar(50) NOT NULL,
      editor_mode varchar(20) NOT NULL,
      time_multiplier numeric(4,2) NOT NULL DEFAULT 1 CHECK (time_multiplier BETWEEN 1 AND 5),
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`INSERT INTO code_languages(key,display_name,runtime_version,editor_mode,time_multiplier) VALUES
      ('javascript','JavaScript','Node.js 22','javascript',1),
      ('java21','Java','Java 21','java',2)`);

    await q.query(`CREATE TABLE code_problems (
      assignment_id uuid PRIMARY KEY REFERENCES assignments(id) ON DELETE RESTRICT,
      statement_md text NOT NULL DEFAULT '' CHECK (length(statement_md) <= 50000),
      constraints_md text NOT NULL DEFAULT '' CHECK (length(constraints_md) <= 5000),
      difficulty varchar(6) CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
      signature jsonb NOT NULL CHECK (jsonb_typeof(signature) = 'object'),
      compare_mode varchar(9) NOT NULL DEFAULT 'EXACT' CHECK (compare_mode IN ('EXACT','FLOAT','UNORDERED')),
      float_epsilon numeric(12,10),
      scoring_mode varchar(14) NOT NULL DEFAULT 'PER_TEST' CHECK (scoring_mode IN ('PER_TEST','ALL_OR_NOTHING')),
      cpu_time_limit_ms integer NOT NULL DEFAULT 2000 CHECK (cpu_time_limit_ms BETWEEN 100 AND 10000),
      memory_limit_mb integer NOT NULL DEFAULT 256 CHECK (memory_limit_mb BETWEEN 64 AND 512),
      validated_revision integer CHECK (validated_revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_code_problem_epsilon CHECK (
        (compare_mode = 'FLOAT' AND float_epsilon IS NOT NULL AND float_epsilon > 0)
        OR (compare_mode <> 'FLOAT' AND float_epsilon IS NULL))
    )`);
    await q.query(`CREATE TABLE code_problem_languages (
      assignment_id uuid NOT NULL REFERENCES code_problems(assignment_id) ON DELETE RESTRICT,
      language_key varchar(20) NOT NULL REFERENCES code_languages(key) ON DELETE RESTRICT,
      starter_code text NOT NULL CHECK (octet_length(starter_code) <= 65536),
      PRIMARY KEY (assignment_id, language_key)
    )`);
    await q.query(`CREATE TABLE code_test_cases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id uuid NOT NULL REFERENCES code_problems(assignment_id) ON DELETE RESTRICT,
      position integer NOT NULL CHECK (position BETWEEN 1 AND 30),
      visibility varchar(6) NOT NULL CHECK (visibility IN ('SAMPLE','HIDDEN')),
      input_args jsonb NOT NULL CHECK (jsonb_typeof(input_args) = 'array'),
      expected jsonb NOT NULL,
      weight integer NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 100),
      explanation_md text CHECK (length(explanation_md) <= 5000),
      CONSTRAINT uq_code_test_position UNIQUE (assignment_id, position),
      CONSTRAINT ck_code_test_explanation CHECK (visibility = 'SAMPLE' OR explanation_md IS NULL),
      CONSTRAINT ck_code_test_size CHECK (octet_length(input_args::text) <= 65536 AND octet_length(expected::text) <= 65536)
    )`);
    await q.query(`CREATE TABLE code_reference_solutions (
      assignment_id uuid NOT NULL REFERENCES code_problems(assignment_id) ON DELETE RESTRICT,
      language_key varchar(20) NOT NULL REFERENCES code_languages(key) ON DELETE RESTRICT,
      source_code text NOT NULL CHECK (octet_length(source_code) BETWEEN 1 AND 65536),
      last_validation jsonb,
      validated_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (assignment_id, language_key)
    )`);
    await q.query(`CREATE TABLE code_drafts (
      assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      language_key varchar(20) NOT NULL REFERENCES code_languages(key) ON DELETE RESTRICT,
      source_code text NOT NULL CHECK (octet_length(source_code) <= 65536),
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (assignment_id, student_id, language_key)
    )`);
    await q.query(`CREATE TABLE code_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
      attempt_number integer NOT NULL CHECK (attempt_number > 0),
      assignment_revision integer NOT NULL CHECK (assignment_revision > 0),
      language_key varchar(20) NOT NULL REFERENCES code_languages(key) ON DELETE RESTRICT,
      runtime_version varchar(50),
      source_code text NOT NULL CHECK (octet_length(source_code) BETWEEN 1 AND 65536),
      source_sha256 char(64) NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
      status varchar(7) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','GRADED','FAILED','VOIDED')),
      verdict varchar(14) CHECK (verdict IN ('ACCEPTED','PARTIAL','WRONG_ANSWER','TIME_LIMIT','MEMORY_LIMIT',
        'RUNTIME_ERROR','OUTPUT_LIMIT','COMPILE_ERROR')),
      counts_as_attempt boolean NOT NULL DEFAULT true,
      passed_count integer CHECK (passed_count >= 0),
      total_count integer CHECK (total_count > 0),
      score numeric(8,2),
      max_score numeric(8,2) NOT NULL CHECK (max_score > 0),
      compile_output varchar(8192),
      max_time_ms integer CHECK (max_time_ms >= 0),
      max_memory_kb integer CHECK (max_memory_kb >= 0),
      submitted_at timestamptz NOT NULL DEFAULT now(),
      judged_at timestamptz,
      voided_reason varchar(2000),
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_code_submission_attempt UNIQUE (assignment_id, student_id, attempt_number),
      CONSTRAINT ck_code_submission_graded CHECK (
        status <> 'GRADED' OR (verdict IS NOT NULL AND score IS NOT NULL AND judged_at IS NOT NULL)),
      CONSTRAINT ck_code_submission_pending CHECK (
        status NOT IN ('QUEUED','RUNNING') OR (verdict IS NULL AND score IS NULL)),
      CONSTRAINT ck_code_submission_score CHECK (score IS NULL OR score BETWEEN 0 AND max_score),
      CONSTRAINT ck_code_submission_void CHECK ((status = 'VOIDED') = (voided_reason IS NOT NULL)),
      CONSTRAINT ck_code_submission_ce CHECK (verdict IS DISTINCT FROM 'COMPILE_ERROR' OR counts_as_attempt = false),
      CONSTRAINT ck_code_submission_counts CHECK (passed_count IS NULL OR total_count IS NULL OR passed_count <= total_count)
    )`);
    await q.query(
      'CREATE INDEX idx_code_submissions_student ON code_submissions(assignment_id,student_id,submitted_at DESC)',
    );
    await q.query(`CREATE UNIQUE INDEX uq_code_submission_inflight ON code_submissions(assignment_id,student_id)
      WHERE status IN ('QUEUED','RUNNING')`);
    await q.query(`CREATE TABLE code_submission_tests (
      submission_id uuid NOT NULL REFERENCES code_submissions(id) ON DELETE RESTRICT,
      test_case_id uuid NOT NULL REFERENCES code_test_cases(id) ON DELETE RESTRICT,
      position integer NOT NULL CHECK (position > 0),
      visibility varchar(6) NOT NULL CHECK (visibility IN ('SAMPLE','HIDDEN')),
      weight integer NOT NULL CHECK (weight > 0),
      status varchar(14) NOT NULL CHECK (status IN ('PASSED','WRONG_ANSWER','TIME_LIMIT','MEMORY_LIMIT',
        'RUNTIME_ERROR','OUTPUT_LIMIT')),
      time_ms integer CHECK (time_ms >= 0),
      memory_kb integer CHECK (memory_kb >= 0),
      actual jsonb,
      console_excerpt varchar(4096),
      PRIMARY KEY (submission_id, test_case_id),
      CONSTRAINT ck_code_test_private CHECK (visibility = 'SAMPLE' OR (actual IS NULL AND console_excerpt IS NULL))
    )`);
    await q.query(`CREATE TABLE code_judge_jobs (
      submission_id uuid PRIMARY KEY REFERENCES code_submissions(id) ON DELETE RESTRICT,
      run_after timestamptz NOT NULL DEFAULT now(),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      locked_until timestamptz,
      last_error varchar(500),
      completed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      'CREATE INDEX idx_code_judge_jobs_due ON code_judge_jobs(run_after,submission_id) WHERE completed_at IS NULL',
    );
    await q.query(`CREATE TABLE code_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
      language_key varchar(20) NOT NULL,
      kind varchar(7) NOT NULL CHECK (kind IN ('SAMPLES','CUSTOM')),
      outcome varchar(20) NOT NULL,
      duration_ms integer CHECK (duration_ms >= 0),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query('CREATE INDEX idx_code_runs_student_time ON code_runs(student_id,created_at)');

    // Best graded attempt per student (decision D6: highest score, earliest on ties).
    await q.query(`CREATE VIEW code_assignment_scores AS
      SELECT DISTINCT ON (assignment_id, student_id)
        assignment_id, student_id, id AS submission_id, score, max_score, verdict, submitted_at
      FROM code_submissions WHERE status = 'GRADED'
      ORDER BY assignment_id, student_id, score DESC, submitted_at ASC, id ASC`);

    await q.query(`CREATE FUNCTION protect_published_code_content() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE aid uuid; st varchar;
      BEGIN
        IF TG_OP = 'DELETE' THEN aid := OLD.assignment_id; ELSE aid := NEW.assignment_id; END IF;
        SELECT status INTO st FROM assignments WHERE id = aid;
        IF st IS DISTINCT FROM 'DRAFT' THEN
          RAISE EXCEPTION 'Published CODE assignment content is frozen';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$`);
    for (const table of [
      'code_problems',
      'code_problem_languages',
      'code_test_cases',
      'code_reference_solutions',
    ])
      await q.query(`CREATE TRIGGER trg_${table}_frozen BEFORE INSERT OR UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION protect_published_code_content()`);

    await q.query(`CREATE FUNCTION protect_finalized_code_submission() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Code submissions are never deleted'; END IF;
        IF OLD.status = 'VOIDED' THEN RAISE EXCEPTION 'Voided code submissions are immutable'; END IF;
        IF OLD.status = 'GRADED' AND (
          NEW.status <> 'VOIDED'
          OR (NEW.source_code, NEW.score, NEW.verdict, NEW.passed_count, NEW.total_count, NEW.language_key,
              NEW.student_id, NEW.assignment_id, NEW.attempt_number, NEW.counts_as_attempt)
            IS DISTINCT FROM
             (OLD.source_code, OLD.score, OLD.verdict, OLD.passed_count, OLD.total_count, OLD.language_key,
              OLD.student_id, OLD.assignment_id, OLD.attempt_number, OLD.counts_as_attempt))
        THEN
          RAISE EXCEPTION 'Graded code submissions can only be voided';
        END IF;
        RETURN NEW;
      END $$`);
    await q.query(`CREATE TRIGGER trg_code_submission_immutable BEFORE UPDATE OR DELETE ON code_submissions
      FOR EACH ROW EXECUTE FUNCTION protect_finalized_code_submission()`);
    await q.query(`CREATE FUNCTION reject_code_submission_test_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Code submission test results are append only'; END $$`);
    await q.query(`CREATE TRIGGER trg_code_submission_tests_immutable BEFORE UPDATE OR DELETE ON code_submission_tests
      FOR EACH ROW EXECUTE FUNCTION reject_code_submission_test_mutation()`);
  }

  async down(q: QueryRunner): Promise<void> {
    // Never silently drop authored problems, student code or grades on rollback.
    const rows: { exists: boolean }[] = await q.query(
      "SELECT EXISTS(SELECT 1 FROM assignments WHERE type = 'CODE') OR EXISTS(SELECT 1 FROM code_submissions) AS exists",
    );
    if (rows[0]?.exists)
      throw new Error(
        'Export CODE assignments and submissions before schema rollback; roll back application only',
      );
    await q.query('DROP VIEW code_assignment_scores');
    await q.query(
      'DROP TABLE code_runs,code_judge_jobs,code_submission_tests,code_submissions,code_drafts,code_reference_solutions,code_test_cases,code_problem_languages,code_problems,code_languages',
    );
    await q.query('DROP FUNCTION protect_published_code_content()');
    await q.query('DROP FUNCTION protect_finalized_code_submission()');
    await q.query('DROP FUNCTION reject_code_submission_test_mutation()');
    await q.query('ALTER TABLE assignments DROP CONSTRAINT ck_assignments_type_rules');
    await q.query('ALTER TABLE assignments DROP CONSTRAINT ck_assignments_max_attempts');
    await q.query('ALTER TABLE assignments DROP CONSTRAINT ck_assignments_type');
    await q.query("ALTER TABLE assignments ADD CHECK (type IN ('QUIZ','ZIP'))");
    await q.query('ALTER TABLE assignments ADD CHECK (max_attempts BETWEEN 1 AND 10)');
    await q.query(`ALTER TABLE assignments ADD CHECK (
      (type = 'QUIZ' AND max_attempts = 1) OR (type = 'ZIP' AND time_limit_minutes IS NULL AND due_at IS NOT NULL))`);
  }
}
