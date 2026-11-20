import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive only. Production rollback disables chat and retains this schema and its keyring. */
export class ChatFoundation1792800000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE chat_conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type varchar(10) NOT NULL,
      class_id uuid REFERENCES classes(id) ON DELETE RESTRICT,
      user_low uuid REFERENCES users(id) ON DELETE RESTRICT,
      user_high uuid REFERENCES users(id) ON DELETE RESTRICT,
      last_event_seq bigint NOT NULL DEFAULT 0 CHECK(last_event_seq >= 0),
      events_pruned_through_seq bigint NOT NULL DEFAULT 0 CHECK(events_pruned_through_seq>=0),
      created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT ck_chat_conversation_shape CHECK(
        (type='CLASS' AND class_id IS NOT NULL AND user_low IS NULL AND user_high IS NULL) OR
        (type='DIRECT' AND class_id IS NULL AND user_low IS NOT NULL AND user_high IS NOT NULL AND user_low < user_high)),
      CONSTRAINT uq_chat_class UNIQUE(class_id), CONSTRAINT uq_chat_pair UNIQUE(user_low,user_high));
    CREATE TABLE chat_members (
      conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE RESTRICT,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      joined_at timestamptz(3) NOT NULL DEFAULT now(), left_at timestamptz(3),
      visible_from_seq bigint NOT NULL DEFAULT 1 CHECK(visible_from_seq >= 1),
      last_read_seq bigint NOT NULL DEFAULT 0 CHECK(last_read_seq >= visible_from_seq-1),
      entitlement_version integer NOT NULL DEFAULT 1 CHECK(entitlement_version > 0),
      announced_version integer NOT NULL DEFAULT 0 CHECK(announced_version>=0),
      PRIMARY KEY(conversation_id,user_id));
    CREATE INDEX idx_chat_members_user ON chat_members(user_id,conversation_id) WHERE left_at IS NULL;
    CREATE TABLE chat_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE RESTRICT,
      sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, client_message_id uuid NOT NULL,
      type varchar(10) NOT NULL DEFAULT 'TEXT' CHECK(type='TEXT'),
      sequence bigint NOT NULL CHECK(sequence>0), last_changed_seq bigint NOT NULL CHECK(last_changed_seq>=sequence),
      version integer NOT NULL DEFAULT 1 CHECK(version>0), reply_to_id uuid,
      ciphertext bytea, iv bytea, tag bytea, key_version integer, crypto_version integer,
      created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(), deleted_at timestamptz(3),
      CONSTRAINT uq_chat_message_scope UNIQUE(conversation_id,id),
      CONSTRAINT uq_chat_message_sequence UNIQUE(conversation_id,sequence),
      CONSTRAINT uq_chat_client_message UNIQUE(conversation_id,sender_id,client_message_id),
      CONSTRAINT fk_chat_reply FOREIGN KEY(conversation_id,reply_to_id) REFERENCES chat_messages(conversation_id,id) ON DELETE RESTRICT,
      CONSTRAINT ck_chat_message_crypto CHECK(
        (deleted_at IS NULL AND ciphertext IS NOT NULL AND octet_length(ciphertext)<=16384 AND
         iv IS NOT NULL AND octet_length(iv)=12 AND tag IS NOT NULL AND octet_length(tag)=16 AND
         key_version IS NOT NULL AND key_version>0 AND crypto_version IS NOT NULL AND crypto_version=1) OR
        (deleted_at IS NOT NULL AND ciphertext IS NULL AND iv IS NULL AND tag IS NULL AND key_version IS NULL AND crypto_version IS NULL)));
    CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);
    CREATE TABLE chat_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE RESTRICT,
      sequence bigint NOT NULL CHECK(sequence>0), type varchar(40) NOT NULL,
      message_id uuid, actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT uq_chat_event_sequence UNIQUE(conversation_id,sequence),
      CONSTRAINT fk_chat_event_message FOREIGN KEY(conversation_id,message_id) REFERENCES chat_messages(conversation_id,id) ON DELETE RESTRICT);
    CREATE INDEX idx_chat_events_created ON chat_events(created_at);
    CREATE TABLE domain_outbox (
      event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type varchar(80) NOT NULL, version integer NOT NULL DEFAULT 1,
      aggregate_type varchar(40) NOT NULL, aggregate_id uuid NOT NULL, occurred_at timestamptz(3) NOT NULL DEFAULT now());
    CREATE TABLE chat_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), consumer varchar(40) NOT NULL,
      event_id uuid NOT NULL, conversation_id uuid REFERENCES chat_conversations(id) ON DELETE RESTRICT,
      recipient_ids uuid[] NOT NULL DEFAULT '{}', checkpoint integer NOT NULL DEFAULT 0,
      status varchar(12) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','DONE','DEAD')),
      attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), next_attempt_at timestamptz(3) NOT NULL DEFAULT now(),
      lease_token uuid, lease_until timestamptz(3), last_error_code varchar(80),
      created_at timestamptz(3) NOT NULL DEFAULT now(), completed_at timestamptz(3),
      CONSTRAINT uq_chat_job_consumer UNIQUE(event_id,consumer),
      CONSTRAINT ck_chat_job_lease CHECK((status='RUNNING' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR
        (status<>'RUNNING' AND lease_token IS NULL AND lease_until IS NULL)));
    CREATE INDEX idx_chat_jobs_due ON chat_jobs(consumer,next_attempt_at) WHERE status IN ('PENDING','RUNNING');
    CREATE TABLE chat_key_usage(key_version integer PRIMARY KEY CHECK(key_version>0),
      encryptions bigint NOT NULL DEFAULT 0 CHECK(encryptions>=0 AND encryptions<=1000000));
    CREATE FUNCTION protect_chat_message_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF (NEW.id,NEW.conversation_id,NEW.sender_id,NEW.client_message_id,NEW.sequence,NEW.reply_to_id,NEW.type,NEW.created_at)
        IS DISTINCT FROM (OLD.id,OLD.conversation_id,OLD.sender_id,OLD.client_message_id,OLD.sequence,OLD.reply_to_id,OLD.type,OLD.created_at) THEN
        RAISE EXCEPTION 'Chat message identity is immutable' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER trg_chat_message_identity BEFORE UPDATE ON chat_messages FOR EACH ROW EXECUTE FUNCTION protect_chat_message_identity();`);
    // Extend the shared append-only receipt store without changing legacy namespaces/views.
    await q.query(`DO $$ DECLARE old_check text; BEGIN
      SELECT pg_get_constraintdef(oid) INTO old_check FROM pg_constraint
        WHERE conrelid='mutation_receipts'::regclass AND conname='ck_receipt_namespace';
      ALTER TABLE mutation_receipts DROP CONSTRAINT ck_receipt_namespace;
      EXECUTE 'ALTER TABLE mutation_receipts ADD CONSTRAINT ck_receipt_namespace ' ||
        replace(old_check,'CHECK (','CHECK (namespace = ''chat'' OR ');
    END $$`);
  }

  async down(q: QueryRunner): Promise<void> {
    // A used chat schema has receipts that must remain append-only and must not lose its history.
    await q.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM chat_messages) OR EXISTS(SELECT 1 FROM mutation_receipts WHERE namespace='chat') THEN
        RAISE EXCEPTION 'Chat history exists: disable chat and retain schema/keyring instead of reverting';
      END IF;
    END $$`);
    await q.query(`DO $$ DECLARE old_check text; BEGIN
      SELECT pg_get_constraintdef(oid) INTO old_check FROM pg_constraint
        WHERE conrelid='mutation_receipts'::regclass AND conname='ck_receipt_namespace';
      ALTER TABLE mutation_receipts DROP CONSTRAINT ck_receipt_namespace;
      EXECUTE 'ALTER TABLE mutation_receipts ADD CONSTRAINT ck_receipt_namespace ' ||
        regexp_replace(old_check, '\\(\\(namespace\\)::text = ''chat''::text\\) OR ', '');
    END $$`);
    await q.query(
      'DROP TABLE chat_key_usage,chat_jobs,domain_outbox,chat_events,chat_messages,chat_members,chat_conversations; DROP FUNCTION protect_chat_message_identity()',
    );
  }
}
