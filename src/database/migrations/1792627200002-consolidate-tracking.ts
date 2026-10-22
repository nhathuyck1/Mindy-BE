import type { MigrationInterface, QueryRunner } from 'typeorm';

// Compatibility views retain the existing write contracts while storing each
// event/receipt exactly once. Catalog snapshots in view comments make down lossless.
const AUDITS = [
  'material_audit_events',
  'teaching_assignment_audits',
  'session_lifecycle_audits',
  'session_schedule_audits',
  'attendance_audits',
  'guest_attendance_audits',
  'makeup_placement_audits',
  'mentor_leave_audits',
  'teaching_note_audits',
  'class_unit_release_audit',
  'session_meeting_audits',
] as const;
const RECEIPTS = [
  'teaching_mutation_receipts',
  'attendance_mutation_receipts',
  'makeup_mutation_receipts',
  'teaching_note_receipts',
] as const;
interface Column {
  name: string;
  type: string;
  required: boolean;
  defaultValue: string | null;
}
interface Constraint {
  name: string;
  type: string;
  definition: string;
  columns: string[];
}
interface Snapshot {
  name: string;
  kind: 'audit' | 'receipt';
  columns: Column[];
  constraints: Constraint[];
  indexes: string[];
  triggers: string[];
}
const ident = (s: string) => `"${s.replaceAll('"', '""')}"`;
const literal = (s: string) => `'${s.replaceAll("'", "''")}'`;
const value = (c: Column) => `((data->>${literal(c.name)})::${c.type})`;

export class ConsolidateTracking1792627200002 implements MigrationInterface {
  private async snapshot(
    q: QueryRunner,
    name: string,
    kind: Snapshot['kind'],
  ): Promise<Snapshot | null> {
    const exists: { exists: boolean }[] = await q.query(
      'SELECT to_regclass($1) IS NOT NULL AS exists',
      [name],
    );
    if (!exists[0]?.exists) return null;
    const columns: Column[] = await q.query(
      `SELECT a.attname AS name,
      format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS required,
      pg_get_expr(d.adbin,d.adrelid) AS "defaultValue"
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
      [name],
    );
    const constraints: Constraint[] = await q.query(
      `SELECT c.conname AS name,c.contype AS type,
      pg_get_constraintdef(c.oid) AS definition,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,p)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.p) AS columns
      FROM pg_constraint c WHERE c.conrelid=$1::regclass`,
      [name],
    );
    const indexes: { definition: string }[] = await q.query(
      `SELECT pg_get_indexdef(i.indexrelid) AS definition
      FROM pg_index i WHERE i.indrelid=$1::regclass
      AND NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conindid=i.indexrelid)`,
      [name],
    );
    const triggers: { definition: string }[] = await q.query(
      `SELECT pg_get_triggerdef(oid) AS definition
      FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal`,
      [name],
    );
    // Never silently remove an unanticipated reference to an audit/receipt table.
    const inbound: unknown[] = await q.query(
      `SELECT 1 FROM pg_constraint WHERE confrelid=$1::regclass`,
      [name],
    );
    if (inbound.length) throw new Error(`Cannot consolidate referenced table ${name}`);
    return {
      name,
      kind,
      columns,
      constraints,
      indexes: indexes.map((i) => i.definition),
      triggers: triggers.map((t) => t.definition),
    };
  }

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS session_meeting_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      old_meeting_url text, new_meeting_url text, version integer NOT NULL CHECK(version>0),
      action varchar(30) NOT NULL DEFAULT 'UPDATE_MEETING_URL', occurred_at timestamptz NOT NULL DEFAULT now())`);
    // Block writes before copying; a row committed between copy and DROP must
    // never disappear. Locks are held until this migration transaction commits.
    for (const name of [...AUDITS, ...RECEIPTS].sort()) {
      const rows: { exists: boolean }[] = await q.query(
        'SELECT to_regclass($1) IS NOT NULL AS exists',
        [name],
      );
      if (rows[0]?.exists) await q.query(`LOCK TABLE ${ident(name)} IN ACCESS EXCLUSIVE MODE`);
    }
    const snapshots: Snapshot[] = [];
    for (const name of AUDITS) {
      const s = await this.snapshot(q, name, 'audit');
      if (s) snapshots.push(s);
    }
    for (const name of RECEIPTS) {
      const s = await this.snapshot(q, name, 'receipt');
      if (s) snapshots.push(s);
    }
    await q.query(`CREATE TABLE audit_events (
      source varchar(80) NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
      actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      occurred_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
      PRIMARY KEY(source,id),
      CHECK((data->>'id')::uuid=id),
      CHECK((data->>'actor_id')::uuid IS NOT DISTINCT FROM actor_id),
      CHECK(COALESCE((data->>'occurred_at')::timestamptz,(data->>'created_at')::timestamptz)=occurred_at))`);
    await q.query(
      `CREATE INDEX idx_audit_events_time ON audit_events(occurred_at DESC,id DESC,source)`,
    );
    await q.query(
      `CREATE INDEX idx_audit_events_actor_time ON audit_events(actor_id,occurred_at DESC,id DESC)`,
    );
    await q.query(
      `CREATE INDEX idx_audit_events_source_time ON audit_events(source,occurred_at DESC,id DESC)`,
    );
    await q.query(`CREATE TABLE mutation_receipts (
      namespace varchar(80) NOT NULL, actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      route varchar(200) NOT NULL, key uuid NOT NULL, payload_hash varchar(64) NOT NULL,
      outcome jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(namespace,actor_id,route,key))`);
    await q.query(`CREATE INDEX idx_mutation_receipts_created ON mutation_receipts(created_at)`);
    await q.query(
      `ALTER TABLE audit_events ADD CONSTRAINT ck_audit_source CHECK(source IN (${AUDITS.map(literal).join(',')}))`,
    );
    await q.query(
      `ALTER TABLE mutation_receipts ADD CONSTRAINT ck_receipt_namespace CHECK(namespace IN (${RECEIPTS.map(literal).join(',')}))`,
    );

    let n = 0;
    const projections = new Set<string>();
    for (const s of snapshots.filter((s) => s.kind === 'audit')) {
      const source = literal(s.name);
      // Preserve the original required fields, CHECKs, uniqueness and real FKs.
      // FKs use stored typed projections, so parent DELETE/UPDATE remains guarded.
      for (const c of s.columns) {
        await q.query(`ALTER TABLE audit_events ADD CONSTRAINT ${ident(`ck_audit_col_${n++}`)}
          CHECK(source<>${source} OR ${c.required ? `${value(c)} IS NOT NULL` : `(data->>${literal(c.name)} IS NULL OR ${value(c)} IS NOT NULL)`})`);
      }
      for (const c of s.constraints) {
        if (c.type === 'c') {
          const expression = c.definition
            .replace(/^CHECK\s*/, '')
            .replace(/"[a-z_]+"|\b[a-z_][a-z_0-9]*\b/g, (token) => {
              const column = s.columns.find((col) => col.name === token.replaceAll('"', ''));
              return column ? value(column) : token;
            });
          await q.query(
            `ALTER TABLE audit_events ADD CONSTRAINT ${ident(`ck_audit_legacy_${n++}`)} CHECK(source<>${source} OR ${expression})`,
          );
        } else if (c.type === 'u') {
          const expressions = c.columns.map((name) => {
            const column = s.columns.find((col) => col.name === name);
            if (!column) throw new Error('Missing unique column');
            return value(column);
          });
          await q.query(
            `CREATE UNIQUE INDEX ${ident(`uq_audit_legacy_${n++}`)} ON audit_events(${expressions.join(',')}) WHERE source=${source}`,
          );
        } else if (c.type === 'f') {
          const refs: string[] = [];
          for (const name of c.columns) {
            const column = s.columns.find((col) => col.name === name);
            if (!column) throw new Error('Missing foreign key column');
            const ref = `ref_${s.name}_${name}`;
            if (!projections.has(ref))
              await q.query(`ALTER TABLE audit_events ADD COLUMN ${ident(ref)} ${column.type}
              GENERATED ALWAYS AS (CASE WHEN source=${source} THEN ${value(column)} END) STORED`);
            projections.add(ref);
            refs.push(ident(ref));
          }
          const definition = c.definition.replace(
            /^FOREIGN KEY \([^)]*\)/,
            `FOREIGN KEY (${refs.join(',')})`,
          );
          await q.query(
            `ALTER TABLE audit_events ADD CONSTRAINT ${ident(`fk_audit_legacy_${n++}`)} ${definition}`,
          );
        }
      }
      await q.query(`INSERT INTO audit_events(source,id,actor_id,occurred_at,data)
        SELECT ${source},id,actor_id,${s.columns.some((c) => c.name === 'occurred_at') ? 'occurred_at' : 'created_at'},to_jsonb(t) FROM ${ident(s.name)} t`);
    }
    for (const s of snapshots.filter((s) => s.kind === 'receipt')) {
      const notes = s.name === 'teaching_note_receipts';
      await q.query(`INSERT INTO mutation_receipts(namespace,actor_id,route,key,payload_hash,outcome,created_at)
        SELECT ${literal(s.name)},actor_id,${notes ? "''" : 'route'},${notes ? 'idempotency_key' : 'key'},
          ${notes ? 'request_hash,response' : 'payload_hash,outcome'},created_at FROM ${ident(s.name)}`);
    }
    await q.query(`CREATE FUNCTION reject_tracking_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Tracking records are append only' USING ERRCODE='23514'; END $$`);
    await q.query(`CREATE FUNCTION write_legacy_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE payload jsonb; BEGIN
      IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Audits are append only' USING ERRCODE='23514'; END IF;
      payload:=to_jsonb(NEW);
      INSERT INTO audit_events(source,id,actor_id,occurred_at,data) VALUES
        (TG_TABLE_NAME,(payload->>'id')::uuid,(payload->>'actor_id')::uuid,COALESCE((payload->>'occurred_at')::timestamptz,(payload->>'created_at')::timestamptz),payload);
      RETURN NEW; END $$`);
    await q.query(`CREATE FUNCTION write_legacy_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE payload jsonb; notes boolean; BEGIN
      IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Receipts are append only' USING ERRCODE='23514'; END IF;
      payload:=to_jsonb(NEW); notes:=TG_TABLE_NAME='teaching_note_receipts';
      INSERT INTO mutation_receipts(namespace,actor_id,route,key,payload_hash,outcome,created_at) VALUES
        (TG_TABLE_NAME,(payload->>'actor_id')::uuid,CASE WHEN notes THEN '' ELSE payload->>'route' END,
        (CASE WHEN notes THEN payload->>'idempotency_key' ELSE payload->>'key' END)::uuid,
        CASE WHEN notes THEN payload->>'request_hash' ELSE payload->>'payload_hash' END,
        CASE WHEN notes THEN payload->'response' ELSE payload->'outcome' END,(payload->>'created_at')::timestamptz);
      RETURN NEW; END $$`);
    for (const s of snapshots) {
      await q.query(`DROP TABLE ${ident(s.name)}`);
      let select: string;
      if (s.kind === 'audit') {
        select = `SELECT ${s.columns.map((c) => `${value(c)} AS ${ident(c.name)}`).join(',')}
          FROM audit_events WHERE source=${literal(s.name)}`;
      } else if (s.name === 'teaching_note_receipts') {
        select = `SELECT actor_id,key AS idempotency_key,payload_hash AS request_hash,outcome AS response,created_at
          FROM mutation_receipts WHERE namespace=${literal(s.name)}`;
      } else {
        select = `SELECT actor_id,route,key,payload_hash,outcome,created_at FROM mutation_receipts WHERE namespace=${literal(s.name)}`;
      }
      await q.query(`CREATE VIEW ${ident(s.name)} AS ${select}`);
      for (const c of s.columns)
        if (c.defaultValue)
          await q.query(
            `ALTER VIEW ${ident(s.name)} ALTER COLUMN ${ident(c.name)} SET DEFAULT ${c.defaultValue}`,
          );
      await q.query(`COMMENT ON VIEW ${ident(s.name)} IS ${literal(JSON.stringify(s))}`);
      await q.query(`CREATE TRIGGER trg_legacy_tracking_write INSTEAD OF INSERT OR UPDATE OR DELETE ON ${ident(s.name)}
        FOR EACH ROW EXECUTE FUNCTION ${s.kind === 'audit' ? 'write_legacy_audit' : 'write_legacy_receipt'}()`);
    }
    await q.query(
      `CREATE TRIGGER trg_audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_tracking_mutation()`,
    );
    await q.query(
      `CREATE TRIGGER trg_mutation_receipts_immutable BEFORE UPDATE OR DELETE ON mutation_receipts FOR EACH ROW EXECUTE FUNCTION reject_tracking_mutation()`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    const snapshots: Snapshot[] = [];
    for (const name of [...AUDITS, ...RECEIPTS]) {
      const rows: { snapshot: string }[] = await q.query(
        `SELECT obj_description(oid,'pg_class') AS snapshot
        FROM pg_class WHERE oid=to_regclass($1) AND relkind='v'`,
        [name],
      );
      if (rows[0]?.snapshot) snapshots.push(JSON.parse(rows[0].snapshot) as Snapshot);
    }
    // All creation/copy/validation is transactional. Do not drop the shared store
    // until every original table and its constraints have been restored.
    for (const s of snapshots) {
      await q.query(`DROP VIEW ${ident(s.name)}`);
      await q.query(
        `CREATE TABLE ${ident(s.name)} (${[
          ...s.columns.map(
            (c) =>
              `${ident(c.name)} ${c.type}${c.required ? ' NOT NULL' : ''}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ''}`,
          ),
          ...s.constraints.map((c) => `CONSTRAINT ${ident(c.name)} ${c.definition}`),
        ].join(',')})`,
      );
      if (s.kind === 'audit') {
        await q.query(`INSERT INTO ${ident(s.name)} SELECT (jsonb_populate_record(NULL::${ident(s.name)},data)).*
          FROM audit_events WHERE source=${literal(s.name)}`);
      } else {
        const notes = s.name === 'teaching_note_receipts';
        await q.query(`INSERT INTO ${ident(s.name)} SELECT actor_id,${notes ? '' : 'route,'}key,payload_hash,outcome,created_at
          FROM mutation_receipts WHERE namespace=${literal(s.name)}`);
      }
      for (const sql of s.indexes) await q.query(sql);
      for (const sql of s.triggers) await q.query(sql);
    }
    await q.query('DROP TABLE audit_events,mutation_receipts');
    await q.query(
      'DROP FUNCTION write_legacy_audit(),write_legacy_receipt(),reject_tracking_mutation()',
    );
    // Keep newly recorded meeting history on rollback; remove only an empty table.
    await q.query(
      `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM session_meeting_audits) THEN DROP TABLE session_meeting_audits; END IF; END $$`,
    );
  }
}
