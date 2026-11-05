import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PushNotifications1793059200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE push_installations (
      id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
      platform varchar(8) NOT NULL DEFAULT 'WEB' CHECK(platform='WEB'),
      token_ciphertext bytea NOT NULL, nonce bytea NOT NULL CHECK(octet_length(nonce)=12),
      auth_tag bytea NOT NULL CHECK(octet_length(auth_tag)=16), key_version integer NOT NULL CHECK(key_version>0),
      token_fingerprint bytea NOT NULL UNIQUE CHECK(octet_length(token_fingerprint)=32),
      generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),
      generation_started_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
      status varchar(8) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED','INVALID','STALE')),
      last_seen_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
      created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(), revoked_at timestamptz(3),
      CHECK((status='ACTIVE')=(revoked_at IS NULL))
    );
    CREATE INDEX idx_push_owner ON push_installations(user_id,status,last_seen_at);
    CREATE INDEX idx_push_session ON push_installations(session_id,status);
    CREATE TABLE push_mutation_events(session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
      created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp());
    CREATE INDEX idx_push_mutation_budget ON push_mutation_events(session_id,created_at);
    CREATE TABLE notification_push_deliveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      installation_id uuid NOT NULL REFERENCES push_installations(id) ON DELETE CASCADE,
      installation_generation bigint NOT NULL CHECK(installation_generation>0),
      status varchar(8) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','SENT','SKIPPED','DEAD')),
      attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
      next_attempt_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
      lease_token uuid, lease_until timestamptz(3), expires_at timestamptz(3) NOT NULL,
      provider_message_id varchar(256), last_error_code varchar(64),
      created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz(3),
      UNIQUE(notification_id,installation_id,installation_generation),
      CHECK((status='RUNNING')=(lease_token IS NOT NULL AND lease_until IS NOT NULL)),
      CHECK((lease_token IS NULL)=(lease_until IS NULL)),
      CHECK((status IN ('SENT','SKIPPED','DEAD'))=(completed_at IS NOT NULL))
    );
    CREATE INDEX idx_push_due ON notification_push_deliveries(status,next_attempt_at);
    CREATE INDEX idx_push_lease ON notification_push_deliveries(lease_until) WHERE status='RUNNING';
    CREATE FUNCTION revoke_session_push() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.revoked_at IS NOT NULL THEN
        UPDATE push_installations SET status='REVOKED',revoked_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE session_id=NEW.id AND status='ACTIVE';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER trg_revoke_session_push AFTER UPDATE OF revoked_at ON auth_sessions
      FOR EACH ROW EXECUTE FUNCTION revoke_session_push();`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER trg_revoke_session_push ON auth_sessions;
      DROP FUNCTION revoke_session_push();
      DROP TABLE notification_push_deliveries; DROP TABLE push_mutation_events; DROP TABLE push_installations;`);
  }
}
