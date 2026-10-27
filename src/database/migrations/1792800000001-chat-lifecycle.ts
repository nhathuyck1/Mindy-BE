import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Transactional lifecycle capture at the persistence boundary covers all existing writers. */
export class ChatLifecycle1792800000001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE chat_members ADD COLUMN last_read_at timestamptz(3);
      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        type varchar(80) NOT NULL DEFAULT 'CHAT_MESSAGE' CHECK(type='CHAT_MESSAGE'),
        message_id uuid NOT NULL, conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE RESTRICT,
        read_at timestamptz(3), created_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT fk_notification_message FOREIGN KEY(conversation_id,message_id) REFERENCES chat_messages(conversation_id,id) ON DELETE RESTRICT,
        CONSTRAINT uq_notification_message UNIQUE(user_id,type,message_id));
      CREATE INDEX idx_notifications_inbox ON notifications(user_id,created_at DESC,id DESC);
      CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
      CREATE FUNCTION capture_chat_class_change() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE eid uuid; BEGIN
        eid=gen_random_uuid();
        INSERT INTO domain_outbox(event_id,type,aggregate_type,aggregate_id)
          VALUES(eid,'CLASS_CHANGED','CLASS',NEW.id);
        INSERT INTO chat_jobs(consumer,event_id) VALUES('LIFECYCLE',eid);
        IF TG_OP='UPDATE' AND NEW.status<>OLD.status THEN
          UPDATE chat_members m SET entitlement_version=entitlement_version+1 FROM chat_conversations c
            WHERE c.id=m.conversation_id AND c.class_id=NEW.id;
        END IF;
        IF TG_OP='UPDATE' AND (NEW.status IN ('CANCELLED','DRAFT') OR NEW.mentor_id<>OLD.mentor_id) THEN
          UPDATE chat_members m SET left_at=clock_timestamp(),entitlement_version=entitlement_version+1
            FROM chat_conversations c WHERE c.id=m.conversation_id AND c.class_id=NEW.id AND m.left_at IS NULL
            AND (NEW.status IN ('CANCELLED','DRAFT') OR m.user_id=OLD.mentor_id);
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_chat_class_change AFTER INSERT OR UPDATE OF status,mentor_id ON classes
        FOR EACH ROW EXECUTE FUNCTION capture_chat_class_change();
      CREATE FUNCTION capture_chat_enrollment_change() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE eid uuid; BEGIN
        eid=gen_random_uuid();
        INSERT INTO domain_outbox(event_id,type,aggregate_type,aggregate_id)
          VALUES(eid,'ENROLLMENT_CHANGED','CLASS',NEW.class_id);
        INSERT INTO chat_jobs(consumer,event_id) VALUES('LIFECYCLE',eid);
        IF NEW.status='CANCELLED' THEN
          UPDATE chat_members m SET left_at=clock_timestamp(),entitlement_version=entitlement_version+1
            FROM chat_conversations c WHERE c.id=m.conversation_id AND c.class_id=NEW.class_id
              AND m.user_id=NEW.student_id AND m.left_at IS NULL;
        ELSIF TG_OP='UPDATE' AND NEW.status<>OLD.status THEN
          UPDATE chat_members m SET entitlement_version=entitlement_version+1 FROM chat_conversations c
            WHERE c.id=m.conversation_id AND c.class_id=NEW.class_id AND m.user_id=NEW.student_id;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_chat_enrollment_change AFTER INSERT OR UPDATE OF status ON enrollments
        FOR EACH ROW EXECUTE FUNCTION capture_chat_enrollment_change();
      CREATE FUNCTION capture_chat_order_change() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE cid uuid; eid uuid; BEGIN
        FOR cid IN SELECT DISTINCT class_id FROM order_details WHERE order_id=NEW.id LOOP
          eid=gen_random_uuid();
          INSERT INTO domain_outbox(event_id,type,aggregate_type,aggregate_id)
            VALUES(eid,'ORDER_CHANGED','CLASS',cid);
          INSERT INTO chat_jobs(consumer,event_id) VALUES('LIFECYCLE',eid);
        END LOOP;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_chat_order_change AFTER UPDATE OF status,expires_at ON orders
        FOR EACH ROW EXECUTE FUNCTION capture_chat_order_change();
      CREATE FUNCTION capture_chat_user_change() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE cid uuid; eid uuid; BEGIN
        IF (NEW.status,NEW.role) IS NOT DISTINCT FROM (OLD.status,OLD.role) THEN RETURN NEW; END IF;
        IF NEW.status<>'ACTIVE' OR NEW.role<>OLD.role THEN
          UPDATE chat_members SET left_at=clock_timestamp(),entitlement_version=entitlement_version+1
            WHERE user_id=NEW.id AND left_at IS NULL AND conversation_id IN (SELECT id FROM chat_conversations WHERE type='CLASS');
        END IF;
        FOR cid IN SELECT id FROM classes WHERE mentor_id=NEW.id UNION SELECT class_id FROM enrollments WHERE student_id=NEW.id LOOP
          eid=gen_random_uuid();INSERT INTO domain_outbox(event_id,type,aggregate_type,aggregate_id) VALUES(eid,'USER_CHANGED','CLASS',cid);
          INSERT INTO chat_jobs(consumer,event_id) VALUES('LIFECYCLE',eid);
        END LOOP;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_chat_user_change AFTER UPDATE OF status,role ON users FOR EACH ROW EXECUTE FUNCTION capture_chat_user_change();`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER trg_chat_user_change ON users;DROP FUNCTION capture_chat_user_change();
      DROP TRIGGER trg_chat_order_change ON orders;
      DROP TRIGGER trg_chat_enrollment_change ON enrollments;
      DROP TRIGGER trg_chat_class_change ON classes;
      DROP FUNCTION capture_chat_order_change(),capture_chat_enrollment_change(),capture_chat_class_change();
      DROP TABLE notifications;
      ALTER TABLE chat_members DROP COLUMN last_read_at;`);
  }
}
