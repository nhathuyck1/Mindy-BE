import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AssignmentsQuiz1792713600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE assignments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
      purpose varchar(8) NOT NULL CHECK(purpose IN ('TEST','HOMEWORK')),
      type varchar(4) NOT NULL CHECK(type IN ('QUIZ','ZIP')),
      title varchar(250) NOT NULL CHECK(length(trim(title))>0),
      description text NOT NULL DEFAULT '' CHECK(length(description)<=20000),
      max_score numeric(8,2) NOT NULL CHECK(max_score>0),
      due_at timestamptz, time_limit_minutes integer CHECK(time_limit_minutes BETWEEN 1 AND 240),
      max_attempts integer NOT NULL DEFAULT 1 CHECK(max_attempts BETWEEN 1 AND 10),
      status varchar(9) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','ARCHIVED')),
      revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      published_at timestamptz, deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK((type='QUIZ' AND max_attempts=1) OR (type='ZIP' AND time_limit_minutes IS NULL AND due_at IS NOT NULL))
    )`);
    await q.query(
      'CREATE INDEX idx_assignments_session ON assignments(session_id,created_at,id) WHERE deleted_at IS NULL',
    );
    await q.query(`CREATE TABLE assignment_questions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
      position integer NOT NULL CHECK(position BETWEEN 1 AND 200),
      prompt text NOT NULL CHECK(length(trim(prompt)) BETWEEN 1 AND 5000),
      CONSTRAINT uq_assignment_question_position UNIQUE(assignment_id,position)
    )`);
    await q.query(`CREATE TABLE assignment_question_options (
      question_id uuid NOT NULL REFERENCES assignment_questions(id) ON DELETE RESTRICT,
      label varchar(1) NOT NULL CHECK(label IN ('A','B','C','D')),
      text text NOT NULL CHECK(length(trim(text)) BETWEEN 1 AND 2000),
      PRIMARY KEY(question_id,label)
    )`);
    await q.query(`CREATE TABLE assignment_answer_keys (
      question_id uuid PRIMARY KEY REFERENCES assignment_questions(id) ON DELETE RESTRICT,
      correct_option varchar(1) NOT NULL,
      FOREIGN KEY(question_id,correct_option) REFERENCES assignment_question_options(question_id,label) ON DELETE RESTRICT
    )`);
    await q.query(`CREATE TABLE assignment_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
      attempt_number integer NOT NULL DEFAULT 1 CHECK(attempt_number>0),
      assignment_revision integer NOT NULL CHECK(assignment_revision>0),
      status varchar(11) NOT NULL CHECK(status IN ('IN_PROGRESS','GRADED','VOIDED')),
      started_at timestamptz NOT NULL, expires_at timestamptz, submitted_at timestamptz,
      submission_source varchar(7) CHECK(submission_source IN ('MANUAL','TIMEOUT')),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      assignment_snapshot jsonb NOT NULL, answers jsonb NOT NULL DEFAULT '[]', result jsonb,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_assignment_quiz_attempt UNIQUE(assignment_id,student_id),
      CHECK((status='GRADED' AND result IS NOT NULL AND submitted_at IS NOT NULL AND submission_source IS NOT NULL)
        OR (status<>'GRADED' AND result IS NULL AND submitted_at IS NULL AND submission_source IS NULL))
    )`);
    await q.query(
      'CREATE INDEX idx_assignment_submissions_student ON assignment_submissions(student_id,id)',
    );
    await q.query(`CREATE TABLE assignment_finalization_jobs (
      submission_id uuid PRIMARY KEY REFERENCES assignment_submissions(id) ON DELETE RESTRICT,
      run_after timestamptz NOT NULL, failures integer NOT NULL DEFAULT 0,
      completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      'CREATE INDEX idx_assignment_jobs_due ON assignment_finalization_jobs(run_after,submission_id) WHERE completed_at IS NULL',
    );
    await q.query(`CREATE TABLE assignment_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
      submission_id uuid REFERENCES assignment_submissions(id) ON DELETE RESTRICT,
      actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      action varchar(32) NOT NULL, version integer NOT NULL CHECK(version>0), reason varchar(2000),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      'CREATE INDEX idx_assignment_audits_assignment ON assignment_audits(assignment_id,created_at,id)',
    );
    await q.query(`CREATE TABLE assignment_receipts (
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      route varchar(150) NOT NULL, idempotency_key uuid NOT NULL, request_hash varchar(64) NOT NULL,
      resource_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(actor_id,route,idempotency_key)
    )`);
    await q.query(`CREATE FUNCTION reject_assignment_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Assignment audits are append only'; END $$`);
    await q.query(`CREATE TRIGGER trg_assignment_audit_immutable BEFORE UPDATE OR DELETE ON assignment_audits
      FOR EACH ROW EXECUTE FUNCTION reject_assignment_audit_mutation()`);
    await q.query(`CREATE FUNCTION protect_finalized_quiz_submission() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.status IN ('GRADED','VOIDED') THEN
          RAISE EXCEPTION 'Finalized quiz submissions are immutable';
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$`);
    await q.query(`CREATE TRIGGER trg_quiz_submission_immutable BEFORE UPDATE OR DELETE ON assignment_submissions
      FOR EACH ROW EXECUTE FUNCTION protect_finalized_quiz_submission()`);
  }

  async down(q: QueryRunner): Promise<void> {
    // Never silently remove submitted work or answer/grade history on rollback.
    const rows: { exists: boolean }[] = await q.query('SELECT EXISTS(SELECT 1 FROM assignments)');
    if (rows[0]?.exists)
      throw new Error(
        'Export assignment history before schema rollback; roll back application only',
      );
    await q.query(
      'DROP TABLE assignment_receipts,assignment_audits,assignment_finalization_jobs,assignment_submissions,assignment_answer_keys,assignment_question_options,assignment_questions,assignments',
    );
    await q.query('DROP FUNCTION reject_assignment_audit_mutation()');
    await q.query('DROP FUNCTION protect_finalized_quiz_submission()');
  }
}
