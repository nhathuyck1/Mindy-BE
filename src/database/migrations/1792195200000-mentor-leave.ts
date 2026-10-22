import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MentorLeave1792195200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE mentor_leave_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      mentor_id uuid NOT NULL REFERENCES users(id),
      from_date date NOT NULL, to_date date NOT NULL,
      period varchar(12) NOT NULL CHECK(period IN ('MORNING','AFTERNOON','EVENING','FULL_DAY')),
      reason varchar(1000) NOT NULL CHECK(length(trim(reason))>0),
      status varchar(12) NOT NULL DEFAULT 'PENDING'
        CHECK(status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN','EXPIRED')),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),
      submitted_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
      reviewed_by uuid REFERENCES users(id), review_reason varchar(1000), reviewed_at timestamptz,
      CHECK(to_date>=from_date AND to_date-from_date<93))`);
    await q.query(
      `CREATE INDEX idx_leave_mentor ON mentor_leave_requests(mentor_id,submitted_at DESC,id DESC)`,
    );
    await q.query(
      `CREATE INDEX idx_leave_status ON mentor_leave_requests(status,submitted_at DESC,id DESC)`,
    );
    await q.query(`CREATE TABLE mentor_leave_items (
      request_id uuid NOT NULL REFERENCES mentor_leave_requests(id),
      source_session_id uuid NOT NULL REFERENCES class_sessions(id),
      class_id uuid NOT NULL REFERENCES classes(id), source_version integer NOT NULL,
      source_starts_at timestamptz NOT NULL, source_ends_at timestamptz NOT NULL,
      starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
      replacement_session_id uuid REFERENCES class_sessions(id),
      PRIMARY KEY(request_id,source_session_id), CHECK(ends_at>starts_at),
      CHECK(ends_at-starts_at=source_ends_at-source_starts_at))`);
    await q.query(`CREATE TABLE mentor_approved_leave_intervals (
      request_id uuid NOT NULL REFERENCES mentor_leave_requests(id),
      mentor_id uuid NOT NULL REFERENCES users(id), starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL, PRIMARY KEY(request_id,starts_at), CHECK(ends_at>starts_at))`);
    await q.query(
      `CREATE INDEX idx_approved_leave_mentor ON mentor_approved_leave_intervals(mentor_id,starts_at,ends_at)`,
    );
    await q.query(`CREATE TABLE mentor_leave_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES mentor_leave_requests(id),
      actor_id uuid NOT NULL REFERENCES users(id), action varchar(12) NOT NULL,
      version integer NOT NULL, reason varchar(1000) NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id,version))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM mentor_leave_requests) THEN
      RAISE EXCEPTION 'Leave history exists; retain schema and roll back application only';
      END IF; END $$`);
    await q.query(
      'DROP TABLE mentor_leave_audits,mentor_approved_leave_intervals,mentor_leave_items,mentor_leave_requests',
    );
  }
}
