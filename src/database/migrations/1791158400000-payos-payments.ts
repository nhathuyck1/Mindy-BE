import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive only: existing checkout holds and order snapshots are preserved. */
export class PayosPayments1791158400000 implements MigrationInterface {
  name = 'PayosPayments1791158400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE SEQUENCE payos_order_code_seq START 1000000000 MAXVALUE 9007199254740991 NO CYCLE`,
    );
    await q.query(`CREATE TABLE payment_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
      amount bigint NOT NULL CHECK (amount > 0 AND amount <= 9007199254740991),
      status varchar(30) NOT NULL DEFAULT 'CREATING'
        CHECK (status IN ('CREATING', 'PENDING', 'SUCCEEDED', 'REQUIRES_REVIEW')),
      reference_code varchar(150) UNIQUE, paid_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE TABLE payos_payment_details (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_transaction_id uuid NOT NULL UNIQUE REFERENCES payment_transactions(id) ON DELETE RESTRICT,
      channel_key varchar(64) NOT NULL,
      payos_order_code bigint NOT NULL DEFAULT nextval('payos_order_code_seq') UNIQUE
        CHECK (payos_order_code > 0 AND payos_order_code <= 9007199254740991),
      payment_link_id varchar(150) UNIQUE, checkout_url text, qr_code text,
      lease_token uuid, lease_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE TABLE payment_webhook_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_key varchar(64) NOT NULL UNIQUE, fingerprint varchar(64) NOT NULL,
      payment_id uuid REFERENCES payment_transactions(id) ON DELETE RESTRICT,
      provider_order_code bigint NOT NULL, reference_code varchar(150) NOT NULL,
      payment_link_id varchar(150) NOT NULL, amount bigint NOT NULL, currency varchar(10) NOT NULL,
      result_code varchar(10) NOT NULL, source varchar(20) NOT NULL
        CHECK (source IN ('WEBHOOK', 'RECONCILIATION')),
      actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      outcome varchar(30) NOT NULL CHECK (outcome IN ('SETTLED', 'REQUIRES_REVIEW', 'CONFIRM_SAMPLE')),
      reason varchar(60), created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      `CREATE INDEX idx_payment_events_review ON payment_webhook_events(outcome, created_at, id)`,
    );
    await q.query(`CREATE TABLE class_unit_progress (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
      class_unit_id uuid NOT NULL REFERENCES class_units(id) ON DELETE RESTRICT,
      status varchar(20) NOT NULL DEFAULT 'NOT_STARTED'
        CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
      progress_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_progress_enrollment_unit UNIQUE (enrollment_id, class_unit_id)
    )`);
    await q.query(`CREATE TABLE payment_confirmation_emails (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      order_code varchar(50) NOT NULL, amount bigint NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
      next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz,
      sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      `CREATE INDEX idx_payment_mail_due ON payment_confirmation_emails(status, next_attempt_at)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    // Local/pre-payment rollback only. Never run this after issuing live links.
    for (const table of [
      'payment_confirmation_emails',
      'class_unit_progress',
      'payment_webhook_events',
      'payos_payment_details',
      'payment_transactions',
    ]) {
      await q.query(`DROP TABLE ${table}`);
    }
    await q.query('DROP SEQUENCE payos_order_code_seq');
  }
}
