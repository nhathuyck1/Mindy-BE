import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ConsolidateSystemRuleAudits1794182400001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    if (!q.isTransactionActive)
      throw new Error('System rule audit consolidation requires a transaction');
    await q.query('LOCK TABLE system_rule_audits,audit_events IN ACCESS EXCLUSIVE MODE');
    await q.query(`DO $$ DECLARE old_check text; BEGIN
      SELECT pg_get_constraintdef(oid) INTO old_check FROM pg_constraint
        WHERE conrelid='audit_events'::regclass AND conname='ck_audit_source';
      IF old_check IS NULL THEN RAISE EXCEPTION 'System audit source constraint not found'; END IF;
      ALTER TABLE audit_events DROP CONSTRAINT ck_audit_source;
      EXECUTE 'ALTER TABLE audit_events ADD CONSTRAINT ck_audit_source ' ||
        replace(old_check,'CHECK (','CHECK (source = ''system_rule_audits'' OR ');
    END $$`);
    await q.query(`ALTER TABLE audit_events
      ADD COLUMN ref_system_rule_key varchar(100) GENERATED ALWAYS AS
        (CASE WHEN source='system_rule_audits' THEN data->>'rule_key' END) STORED
        REFERENCES system_rules(key) ON DELETE RESTRICT,
      ADD CONSTRAINT ck_system_rule_audit_fields CHECK(source<>'system_rule_audits' OR (
        ref_system_rule_key IS NOT NULL AND actor_id IS NOT NULL
        AND jsonb_typeof(data->'old_value')='boolean' AND jsonb_typeof(data->'new_value')='boolean'
        AND length(trim(data->>'reason')) BETWEEN 1 AND 1000
        AND (data->>'version')::integer>0
      ) IS TRUE);
      INSERT INTO audit_events(source,id,actor_id,occurred_at,data)
        SELECT 'system_rule_audits',id,actor_id,created_at,to_jsonb(a) FROM system_rule_audits a;
      CREATE UNIQUE INDEX uq_system_rule_audit_version ON audit_events(ref_system_rule_key,((data->>'version')::integer))
        WHERE source='system_rule_audits';
      DROP TABLE system_rule_audits;
      CREATE VIEW system_rule_audits AS SELECT id,ref_system_rule_key AS rule_key,
        (data->>'old_value')::boolean AS old_value,(data->>'new_value')::boolean AS new_value,
        actor_id,data->>'reason' AS reason,(data->>'version')::integer AS version,occurred_at AS created_at
        FROM audit_events WHERE source='system_rule_audits';
      ALTER VIEW system_rule_audits ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER VIEW system_rule_audits ALTER COLUMN created_at SET DEFAULT clock_timestamp();
      CREATE TRIGGER trg_system_rule_audit_write INSTEAD OF INSERT OR UPDATE OR DELETE ON system_rule_audits
        FOR EACH ROW EXECUTE FUNCTION write_legacy_audit()`);
  }

  async down(): Promise<void> {
    throw new Error(
      'Audit consolidation requires a forward migration; restore a matching backup to revert',
    );
  }
}
