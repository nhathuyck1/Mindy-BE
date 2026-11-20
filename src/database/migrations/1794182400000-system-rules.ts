import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SystemRules1794182400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE system_rules (
      key varchar(100) PRIMARY KEY, value boolean NOT NULL, version integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by uuid REFERENCES users(id)
    )`);
    await q.query(`CREATE TABLE system_rule_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_key varchar(100) NOT NULL REFERENCES system_rules(key),
      old_value boolean NOT NULL, new_value boolean NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
      reason varchar(1000) NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )`);
    await q.query(
      `INSERT INTO system_rules(key,value) VALUES ('session_start_time_enforced',true)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE system_rule_audits');
    await q.query('DROP TABLE system_rules');
  }
}
