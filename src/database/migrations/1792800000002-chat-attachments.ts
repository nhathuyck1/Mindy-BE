import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Separate owner model isolates CHAT files from all existing CourseUnit-based Files APIs. */
export class ChatAttachments1792800000002 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE chat_file_objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purpose varchar(10) NOT NULL DEFAULT 'CHAT' CHECK(purpose='CHAT'),
      conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE RESTRICT,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      original_name varchar(250) NOT NULL, declared_mime_type varchar(150) NOT NULL,
      declared_size_bytes bigint NOT NULL CHECK(declared_size_bytes>0 AND declared_size_bytes<=10485760),
      bucket varchar(100) NOT NULL, staging_key varchar(1024) NOT NULL, staging_version_id varchar(1024),
      object_key varchar(1024), object_version_id varchar(1024),
      mime_type varchar(150), kind varchar(10), size_bytes bigint,
      status varchar(20) NOT NULL DEFAULT 'PENDING_UPLOAD' CHECK(status IN ('PENDING_UPLOAD','PROCESSING','READY','FAILED','DELETING','DELETED')),
      intent_expires_at timestamptz(3) NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(),
      ready_at timestamptz(3), error_code varchar(80),
      CONSTRAINT uq_chat_file_scope UNIQUE(conversation_id,id),
      CONSTRAINT ck_chat_file_ready CHECK(status<>'READY' OR (object_key IS NOT NULL AND object_version_id IS NOT NULL
        AND mime_type IS NOT NULL AND size_bytes IS NOT NULL AND size_bytes=declared_size_bytes AND kind IN ('IMAGE','PDF') AND ready_at IS NOT NULL)));
      CREATE INDEX idx_chat_files_owner ON chat_file_objects(owner_user_id,status);
      CREATE TABLE chat_file_copies (
        file_id uuid NOT NULL REFERENCES chat_file_objects(id) ON DELETE RESTRICT,
        token uuid NOT NULL, object_key varchar(1024) NOT NULL, version_id varchar(1024),
        created_at timestamptz(3) NOT NULL DEFAULT now(), PRIMARY KEY(file_id,token));
      CREATE FUNCTION protect_chat_file_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF (NEW.id,NEW.purpose,NEW.conversation_id,NEW.owner_user_id,NEW.original_name,NEW.declared_mime_type,
          NEW.declared_size_bytes,NEW.bucket,NEW.staging_key,NEW.intent_expires_at)
          IS DISTINCT FROM (OLD.id,OLD.purpose,OLD.conversation_id,OLD.owner_user_id,OLD.original_name,OLD.declared_mime_type,
          OLD.declared_size_bytes,OLD.bucket,OLD.staging_key,OLD.intent_expires_at) THEN
          RAISE EXCEPTION 'Chat file identity is immutable' USING ERRCODE='23514'; END IF;
        IF OLD.staging_version_id IS NOT NULL AND NEW.staging_version_id IS DISTINCT FROM OLD.staging_version_id THEN
          RAISE EXCEPTION 'Chat upload version is immutable' USING ERRCODE='23514'; END IF;
        IF OLD.ready_at IS NOT NULL AND (NEW.object_key,NEW.object_version_id,NEW.mime_type,NEW.size_bytes,NEW.kind,NEW.ready_at)
          IS DISTINCT FROM (OLD.object_key,OLD.object_version_id,OLD.mime_type,OLD.size_bytes,OLD.kind,OLD.ready_at) THEN
          RAISE EXCEPTION 'Verified chat file is immutable' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_chat_file_identity BEFORE UPDATE ON chat_file_objects FOR EACH ROW EXECUTE FUNCTION protect_chat_file_identity();
      ALTER TABLE chat_messages ADD COLUMN file_object_id uuid;
      ALTER TABLE chat_messages ADD COLUMN body_is_null boolean NOT NULL DEFAULT false;
      ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_message_file FOREIGN KEY(conversation_id,file_object_id)
        REFERENCES chat_file_objects(conversation_id,id) ON DELETE RESTRICT;
      ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_type_check;
      ALTER TABLE chat_messages ADD CONSTRAINT ck_chat_message_type CHECK(
        (type='TEXT' AND file_object_id IS NULL AND NOT body_is_null) OR (type IN ('IMAGE','FILE') AND file_object_id IS NOT NULL));
      CREATE INDEX idx_chat_message_files ON chat_messages(file_object_id) WHERE deleted_at IS NULL;`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM chat_file_objects) THEN
      RAISE EXCEPTION 'Attachment data exists: disable attachments and retain schema'; END IF; END $$;
      ALTER TABLE chat_messages DROP CONSTRAINT fk_chat_message_file;
      ALTER TABLE chat_messages DROP CONSTRAINT ck_chat_message_type;
      DROP INDEX idx_chat_message_files;
      ALTER TABLE chat_messages DROP COLUMN file_object_id,DROP COLUMN body_is_null;
      ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_type_check CHECK(type='TEXT');
      DROP TABLE chat_file_copies,chat_file_objects;DROP FUNCTION protect_chat_file_identity();`);
  }
}
