import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Persistence-boundary capture covers bulk/worker writers as well as HTTP commands. */
export class BusinessNotifications1795132800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE class_sessions ADD COLUMN notification_schedule_revision integer NOT NULL DEFAULT 1 CHECK(notification_schedule_revision>0);
      ALTER TABLE assignments ADD COLUMN notification_deadline_revision integer NOT NULL DEFAULT 1 CHECK(notification_deadline_revision>0);
      ALTER TABLE orders ADD COLUMN notification_expiry_revision integer NOT NULL DEFAULT 1 CHECK(notification_expiry_revision>0);
      ALTER TABLE enrollments ADD COLUMN notification_entitlement_revision integer NOT NULL DEFAULT 1 CHECK(notification_entitlement_revision>0);
      CREATE FUNCTION advance_notification_entitlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('CANCELLED','COMPLETED') THEN
          NEW.notification_entitlement_revision=OLD.notification_entitlement_revision+1;
        END IF; RETURN NEW; END $$;
      CREATE TRIGGER aaa_notification_entitlement BEFORE UPDATE OF status ON enrollments FOR EACH ROW EXECUTE FUNCTION advance_notification_entitlement();
      CREATE TABLE notification_producers (
        name text PRIMARY KEY CHECK(name IN ('SCHEDULE','ASSIGNMENT','PAYMENT','LEAVE_MAKEUP','MATERIAL','REMINDER')),
        activated_at timestamptz, epoch uuid NOT NULL DEFAULT gen_random_uuid());
      INSERT INTO notification_producers(name) VALUES ('SCHEDULE'),('ASSIGNMENT'),('PAYMENT'),('LEAVE_MAKEUP'),('MATERIAL'),('REMINDER');
      CREATE TABLE notification_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_key text NOT NULL UNIQUE,
        producer text NOT NULL REFERENCES notification_producers(name), epoch uuid NOT NULL,
        type varchar(80) NOT NULL, resource_kind text NOT NULL, resource_id uuid NOT NULL,
        context_id uuid, actor_id uuid REFERENCES users(id), revision text NOT NULL,
        schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
        cause_id uuid NOT NULL DEFAULT gen_random_uuid(),
        occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), not_before timestamptz NOT NULL DEFAULT clock_timestamp(),
        status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','DONE','DEAD')),
        attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        lease_id uuid, lease_until timestamptz, completed_at timestamptz, last_error text);
      CREATE INDEX idx_notification_events_work ON notification_events(available_at,not_before,id) WHERE status IN ('PENDING','PROCESSING');
      CREATE INDEX idx_notification_assignments_due ON assignments(due_at,id) WHERE status='PUBLISHED' AND deleted_at IS NULL;
      CREATE INDEX idx_notification_sessions_due ON class_sessions(starts_at,id) WHERE status='SCHEDULED';
      CREATE TABLE notification_recipients (
        event_id uuid NOT NULL REFERENCES notification_events(id), user_id uuid NOT NULL REFERENCES users(id),
        role varchar(20) NOT NULL, terminal boolean NOT NULL DEFAULT false, context_ids uuid[] NOT NULL DEFAULT '{}',
        relation_keys text[] NOT NULL DEFAULT '{}',
        processed_at timestamptz, PRIMARY KEY(event_id,user_id));
      ALTER TABLE notifications DROP CONSTRAINT notifications_type_check,
        ALTER COLUMN actor_id DROP NOT NULL, ALTER COLUMN message_id DROP NOT NULL,
        ALTER COLUMN conversation_id DROP NOT NULL,
        ADD COLUMN event_id uuid REFERENCES notification_events(id),
        ADD CONSTRAINT ck_notification_shape CHECK(
          (type='CHAT_MESSAGE' AND actor_id IS NOT NULL AND message_id IS NOT NULL AND conversation_id IS NOT NULL AND event_id IS NULL)
          OR (type IN ('SESSION_RESCHEDULED','SESSION_MENTOR_CHANGED','SESSION_CANCELLED','CLASS_CANCELLED',
            'MAKEUP_SESSION_SCHEDULED','ASSIGNMENT_PUBLISHED','ASSIGNMENT_DEADLINE_CHANGED','ASSIGNMENT_GRADE_RELEASED',
            'PAYMENT_CONFIRMED','ORDER_EXPIRING','ORDER_EXPIRED','MENTOR_LEAVE_REQUESTED','MENTOR_LEAVE_APPROVED',
            'MENTOR_LEAVE_REJECTED','MAKEUP_PLACEMENT_CREATED','MAKEUP_PLACEMENT_CANCELLED','MATERIAL_PUBLISHED',
            'ZIP_SUBMISSION_REVIEW_REQUIRED','MATERIAL_REVIEW_APPROVED','MATERIAL_REVIEW_REJECTED',
            'SESSION_STARTING_SOON','ASSIGNMENT_DUE_SOON') AND event_id IS NOT NULL AND actor_id IS NULL
            AND conversation_id IS NULL AND message_id IS NULL)),
        ADD CONSTRAINT uq_notification_event UNIQUE(user_id,event_id);

      -- Public read projection of schedule entitlement: regular CASH preview and scoped guests.
      CREATE FUNCTION notification_session_recipients(sid uuid)
      RETURNS TABLE(user_id uuid,role text) LANGUAGE sql STABLE AS $$
        SELECT u.id,u.role::text FROM class_sessions s JOIN classes c ON c.id=s.class_id
          JOIN enrollments e ON e.class_id=c.id JOIN order_details od ON od.id=e.order_detail_id AND od.class_id=c.id
          JOIN orders o ON o.id=od.order_id AND o.student_id=e.student_id JOIN users u ON u.id=e.student_id
          WHERE s.id=sid AND c.status<>'CANCELLED' AND u.status='ACTIVE' AND u.role='STUDENT'
          AND (e.status='ACTIVE' OR (e.status='PENDING_PAYMENT' AND o.payment_type='CASH' AND o.status='PENDING' AND o.expires_at>clock_timestamp()))
        UNION
        SELECT u.id,u.role::text FROM makeup_placements p JOIN enrollments e ON e.id=p.enrollment_id
          JOIN classes src ON src.id=p.source_class_id JOIN classes c ON c.id=p.target_class_id
          JOIN class_sessions s ON s.id=p.target_session_id JOIN users u ON u.id=p.student_id
          WHERE s.id=sid AND p.status IN ('ASSIGNED','COMPLETED') AND e.status='ACTIVE'
          AND src.status IN ('OPEN','IN_PROGRESS') AND c.status IN ('OPEN','IN_PROGRESS') AND s.status<>'CANCELLED'
          AND u.status='ACTIVE' AND u.role='STUDENT'
        UNION
        SELECT u.id,u.role::text FROM class_sessions s JOIN classes c ON c.id=s.class_id JOIN users u
          ON u.id=CASE WHEN s.status='SCHEDULED' THEN COALESCE(s.mentor_override_id,c.mentor_id) ELSE s.teaching_mentor_id END
          WHERE s.id=sid AND c.status<>'CANCELLED' AND u.status='ACTIVE' AND u.role='MENTOR'
      $$;
      CREATE FUNCTION notification_assignment_recipients(aid uuid)
      RETURNS TABLE(user_id uuid,role text) LANGUAGE sql STABLE AS $$
        SELECT u.id,u.role::text FROM assignments a JOIN class_sessions s ON s.id=a.session_id
          JOIN classes c ON c.id=s.class_id JOIN enrollments e ON e.class_id=c.id
          JOIN users u ON u.id=e.student_id WHERE a.id=aid AND e.status='ACTIVE' AND c.status<>'CANCELLED'
          AND s.status<>'CANCELLED' AND u.status='ACTIVE' AND u.role='STUDENT'
      $$;
      CREATE FUNCTION notification_assignment_mentors(aid uuid)
      RETURNS TABLE(user_id uuid,role text) LANGUAGE sql STABLE AS $$
        SELECT u.id,u.role::text FROM assignments a JOIN class_sessions s ON s.id=a.session_id
          JOIN classes c ON c.id=s.class_id JOIN users u ON u.id=c.mentor_id OR u.id=
          CASE WHEN s.status='SCHEDULED' THEN COALESCE(s.mentor_override_id,c.mentor_id) ELSE s.teaching_mentor_id END
          WHERE a.id=aid AND u.role='MENTOR' AND u.status='ACTIVE'
      $$;
      CREATE FUNCTION notification_material_recipients(mid uuid)
      RETURNS TABLE(user_id uuid,role text,context_ids uuid[]) LANGUAGE sql STABLE AS $$
        SELECT u.id,u.role::text,array_agg(DISTINCT c.id ORDER BY c.id)
          FROM materials m JOIN class_units cu ON cu.course_unit_id=m.course_unit_id
          JOIN classes c ON c.id=cu.class_id JOIN enrollments e ON e.class_id=c.id
          JOIN users u ON u.id=e.student_id WHERE m.id=mid AND e.status='ACTIVE' AND c.status<>'CANCELLED'
          AND u.status='ACTIVE' AND u.role='STUDENT' GROUP BY u.id,u.role
      $$;
      CREATE FUNCTION notification_relation_keys(uid uuid,rid uuid,k text,ctx uuid DEFAULT NULL)
      RETURNS text[] LANGUAGE sql STABLE AS $$
        SELECT COALESCE(array_agg(DISTINCT key),'{}') FROM (
          SELECT 'enrollment/'||e.id::text||'/'||e.notification_entitlement_revision::text AS key FROM enrollments e
          WHERE e.student_id=uid AND (e.status='ACTIVE' OR (k='SESSION' AND e.status='PENDING_PAYMENT' AND EXISTS(
            SELECT 1 FROM order_details od JOIN orders o ON o.id=od.order_id WHERE od.id=e.order_detail_id AND od.class_id=e.class_id
              AND o.student_id=e.student_id AND o.status='PENDING' AND o.payment_type='CASH' AND o.expires_at>clock_timestamp()))) AND (
            (k='SESSION' AND e.class_id=COALESCE(ctx,(SELECT class_id FROM class_sessions WHERE id=rid)))
            OR (k='ASSIGNMENT' AND e.class_id=(SELECT s.class_id FROM assignments a JOIN class_sessions s ON s.id=a.session_id WHERE a.id=rid))
            OR (k='MATERIAL' AND EXISTS(SELECT 1 FROM class_units cu JOIN materials m ON m.course_unit_id=cu.course_unit_id WHERE cu.class_id=e.class_id AND m.id=rid)))
          UNION ALL SELECT 'placement/'||p.id::text||'/'||e.notification_entitlement_revision::text FROM makeup_placements p
            JOIN enrollments e ON e.id=p.enrollment_id WHERE k='SESSION' AND p.target_session_id=rid AND p.student_id=uid
            AND p.status IN ('ASSIGNED','COMPLETED') AND e.status='ACTIVE'
        ) relations
      $$;
      CREATE FUNCTION notification_capture(p text,t text,k text,rid uuid,rev text,recipients jsonb,
        actor uuid DEFAULT NULL,ctx uuid DEFAULT NULL,delayed timestamptz DEFAULT NULL)
      RETURNS uuid LANGUAGE plpgsql AS $$
      DECLARE activation notification_producers%ROWTYPE; eid uuid; cause uuid; BEGIN
        SELECT * INTO activation FROM notification_producers WHERE name=p FOR SHARE;
        IF activation.activated_at IS NULL THEN RETURN NULL; END IF;
        cause=NULLIF(current_setting('mindy.notification_cause_id',true),'')::uuid;
        IF cause IS NULL THEN cause=gen_random_uuid(); PERFORM set_config('mindy.notification_cause_id',cause::text,true); END IF;
        INSERT INTO notification_events(event_key,producer,epoch,type,resource_kind,resource_id,revision,actor_id,context_id,not_before,cause_id)
          VALUES(activation.epoch::text||':'||t||':'||rid::text||':'||rev,p,activation.epoch,t,k,rid,rev,actor,ctx,COALESCE(delayed,clock_timestamp()),cause)
          ON CONFLICT(event_key) DO NOTHING RETURNING id INTO eid;
        IF eid IS NULL THEN RETURN NULL; END IF;
        INSERT INTO notification_recipients(event_id,user_id,role,terminal,context_ids,relation_keys)
          SELECT DISTINCT ON (u.id) eid,u.id,u.role::text,COALESCE((v->>'terminal')::boolean,false),
            ARRAY(SELECT jsonb_array_elements_text(COALESCE(v->'context_ids','[]'))::uuid),
            CASE WHEN u.role='STUDENT' THEN notification_relation_keys(u.id,rid,k,ctx) ELSE '{}'::text[] END
          FROM jsonb_array_elements(COALESCE(recipients,'[]')) v JOIN users u ON u.id=(v->>'user_id')::uuid
          WHERE u.status='ACTIVE' AND u.role::text=v->>'role'
          AND (actor IS NULL OR u.id<>actor OR t IN ('PAYMENT_CONFIRMED','ORDER_EXPIRING','ORDER_EXPIRED'));
        RETURN eid;
      END $$;

      -- BEFORE capture preserves recipients before cancellation cascades invalidate guest access.
      CREATE FUNCTION capture_notification_session() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE rec jsonb; cid uuid; oldmentor uuid; newmentor uuid; actor uuid;
      BEGIN
        SELECT class_id INTO cid FROM class_units WHERE id=NEW.class_unit_id;
        actor=NULLIF(current_setting('mindy.actor_id',true),'')::uuid;
        IF (SELECT status FROM classes WHERE id=cid)='DRAFT' THEN RETURN NEW; END IF;
        IF TG_OP='INSERT' THEN
          IF NEW.makeup_for_session_id IS NOT NULL THEN
            SELECT jsonb_agg(to_jsonb(x)) INTO rec FROM notification_session_recipients(NEW.makeup_for_session_id) x WHERE x.role='STUDENT';
            SELECT COALESCE(NEW.mentor_override_id,mentor_id) INTO newmentor FROM classes WHERE id=cid;
            rec=COALESCE(rec,'[]')||COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',id,'role',role)) FROM users WHERE id=newmentor),'[]');
            PERFORM notification_capture('SCHEDULE','MAKEUP_SESSION_SCHEDULED','SESSION',NEW.id,'1',rec,actor,cid);
          END IF; RETURN NEW;
        END IF;
        IF (NEW.starts_at,NEW.ends_at) IS DISTINCT FROM (OLD.starts_at,OLD.ends_at) THEN
          NEW.notification_schedule_revision=OLD.notification_schedule_revision+1;
        END IF;
        SELECT jsonb_agg(to_jsonb(x)) INTO rec FROM notification_session_recipients(OLD.id) x;
        IF NEW.status='CANCELLED' AND OLD.status<>'CANCELLED' THEN
          IF COALESCE(current_setting('mindy.notification_class_cancel',true),'')=cid::text THEN
            SELECT jsonb_agg(DISTINCT to_jsonb(x)||'{"terminal":true}'::jsonb) INTO rec
              FROM class_sessions cs CROSS JOIN LATERAL notification_session_recipients(cs.id) x WHERE cs.class_id=cid;
            PERFORM notification_capture('SCHEDULE','CLASS_CANCELLED','CLASS',cid,'CANCELLED',rec,actor);
          ELSE
            SELECT jsonb_agg(v||'{"terminal":true}'::jsonb) INTO rec FROM jsonb_array_elements(COALESCE(rec,'[]')) v;
            PERFORM notification_capture('SCHEDULE','SESSION_CANCELLED','SESSION',NEW.id,NEW.version::text,rec,actor,cid);
          END IF;
        ELSIF NEW.status='SCHEDULED' THEN
          IF (NEW.starts_at,NEW.ends_at) IS DISTINCT FROM (OLD.starts_at,OLD.ends_at) THEN
            PERFORM notification_capture('SCHEDULE','SESSION_RESCHEDULED','SESSION',NEW.id,
              NEW.version::text||'/'||NEW.starts_at::text||'/'||NEW.ends_at::text,rec,actor,cid);
          END IF;
          SELECT COALESCE(OLD.mentor_override_id,mentor_id),COALESCE(NEW.mentor_override_id,mentor_id)
            INTO oldmentor,newmentor FROM classes WHERE id=cid;
          IF oldmentor IS DISTINCT FROM newmentor THEN
            SELECT jsonb_agg(CASE WHEN (v->>'user_id')::uuid=oldmentor THEN v||'{"terminal":true}'::jsonb ELSE v END)
              INTO rec FROM jsonb_array_elements(COALESCE(rec,'[]')) v;
            rec=COALESCE(rec,'[]')||COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',id,'role',role)) FROM users WHERE id=newmentor),'[]');
            PERFORM notification_capture('SCHEDULE','SESSION_MENTOR_CHANGED','SESSION',NEW.id,NEW.version::text,rec,actor,cid);
          END IF;
        END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER aaa_notification_session BEFORE INSERT OR UPDATE ON class_sessions FOR EACH ROW EXECUTE FUNCTION capture_notification_session();

      CREATE FUNCTION capture_notification_class() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE rec jsonb; s record; actor uuid;
      BEGIN
        IF OLD.status='DRAFT' OR NEW.status='DRAFT' THEN RETURN NEW; END IF;
        actor=NULLIF(current_setting('mindy.actor_id',true),'')::uuid;
        IF NEW.status='CANCELLED' AND OLD.status<>'CANCELLED' THEN
          SELECT jsonb_agg(DISTINCT to_jsonb(x)||'{"terminal":true}'::jsonb) INTO rec FROM (
            SELECT user_id,role FROM class_sessions cs CROSS JOIN LATERAL notification_session_recipients(cs.id) r WHERE cs.class_id=OLD.id
            UNION SELECT e.student_id,'STUDENT' FROM enrollments e WHERE e.class_id=OLD.id AND e.status='ACTIVE'
            UNION SELECT OLD.mentor_id,'MENTOR') x;
          PERFORM notification_capture('SCHEDULE','CLASS_CANCELLED','CLASS',NEW.id,'CANCELLED',rec,actor);
        END IF;
        IF NEW.mentor_id IS DISTINCT FROM OLD.mentor_id THEN
          FOR s IN SELECT * FROM class_sessions WHERE class_id=NEW.id AND status='SCHEDULED'
            AND starts_at>clock_timestamp() AND mentor_override_id IS NULL LOOP
            SELECT jsonb_agg(CASE WHEN x.user_id=OLD.mentor_id THEN to_jsonb(x)||'{"terminal":true}'::jsonb ELSE to_jsonb(x) END)
              INTO rec FROM notification_session_recipients(s.id) x;
            rec=COALESCE(rec,'[]')||COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',id,'role',role)) FROM users WHERE id=NEW.mentor_id),'[]');
            PERFORM notification_capture('SCHEDULE','SESSION_MENTOR_CHANGED','SESSION',s.id,'class/'||NEW.assignment_version::text,rec,actor,NEW.id);
          END LOOP;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER aaa_notification_class BEFORE UPDATE OF mentor_id,status ON classes FOR EACH ROW EXECUTE FUNCTION capture_notification_class();

      CREATE FUNCTION capture_notification_order() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE t text; rec jsonb; BEGIN
        IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN NEW.notification_expiry_revision=OLD.notification_expiry_revision+1; END IF;
        IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
        IF OLD.status<>'PENDING' THEN RETURN NEW; END IF;
        t=CASE NEW.status WHEN 'PAID' THEN 'PAYMENT_CONFIRMED' WHEN 'EXPIRED' THEN 'ORDER_EXPIRED' ELSE NULL END;
        IF t IS NOT NULL THEN
          SELECT jsonb_agg(jsonb_build_object('user_id',id,'role',role,'terminal',true)) INTO rec FROM users WHERE id=NEW.student_id;
          PERFORM notification_capture('PAYMENT',t,'ORDER',NEW.id,NEW.status::text,rec);
        END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER aaa_notification_order BEFORE UPDATE OF status,expires_at ON orders FOR EACH ROW EXECUTE FUNCTION capture_notification_order();

      CREATE FUNCTION capture_notification_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE rec jsonb; t text; BEGIN
        IF NEW.due_at IS DISTINCT FROM OLD.due_at THEN NEW.notification_deadline_revision=OLD.notification_deadline_revision+1; END IF;
        IF NEW.status='PUBLISHED' AND NEW.deleted_at IS NULL THEN
          t=CASE WHEN OLD.status<>'PUBLISHED' THEN 'ASSIGNMENT_PUBLISHED'
            WHEN NEW.due_at IS DISTINCT FROM OLD.due_at AND NEW.type IN ('ZIP','CODE') THEN 'ASSIGNMENT_DEADLINE_CHANGED' ELSE NULL END;
          IF t IS NOT NULL THEN
            SELECT jsonb_agg(to_jsonb(x)) INTO rec FROM notification_assignment_recipients(NEW.id) x;
            PERFORM notification_capture('ASSIGNMENT',t,'ASSIGNMENT',NEW.id,NEW.revision::text,rec,
              NULLIF(current_setting('mindy.actor_id',true),'')::uuid);
          END IF;
        END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER aaa_notification_assignment BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION capture_notification_assignment();
      CREATE FUNCTION capture_notification_zip() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE rec jsonb; BEGIN
        IF NEW.status='SUBMITTED' AND OLD.status<>'SUBMITTED' THEN
          SELECT jsonb_agg(to_jsonb(x)) INTO rec FROM notification_assignment_mentors(NEW.assignment_id) x;
          PERFORM notification_capture('ASSIGNMENT','ZIP_SUBMISSION_REVIEW_REQUIRED','SUBMISSION',NEW.id,NEW.attempt_number::text,rec,NEW.student_id,NEW.assignment_id);
        END IF;
        IF NEW.released_version IS NOT NULL AND NEW.released_version IS DISTINCT FROM OLD.released_version THEN
          SELECT jsonb_agg(jsonb_build_object('user_id',id,'role',role)) INTO rec FROM users WHERE id=NEW.student_id;
          PERFORM notification_capture('ASSIGNMENT','ASSIGNMENT_GRADE_RELEASED','SUBMISSION',NEW.id,NEW.released_version::text,rec,
            NULLIF(current_setting('mindy.actor_id',true),'')::uuid,NEW.assignment_id);
        END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER trg_notification_zip AFTER UPDATE ON assignment_zip_submissions FOR EACH ROW EXECUTE FUNCTION capture_notification_zip();

      CREATE FUNCTION capture_notification_leave() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE rec jsonb; BEGIN
        IF TG_OP='INSERT' THEN
          IF NEW.status<>'PENDING' THEN RETURN NEW; END IF;
          SELECT jsonb_agg(jsonb_build_object('user_id',id,'role',role)) INTO rec FROM users WHERE status='ACTIVE' AND role IN ('MANAGER','ADMIN');
          PERFORM notification_capture('LEAVE_MAKEUP','MENTOR_LEAVE_REQUESTED','LEAVE',NEW.id,NEW.version::text,rec,NEW.mentor_id);
        ELSIF OLD.status='PENDING' AND NEW.status IN ('APPROVED','REJECTED') THEN
          SELECT jsonb_agg(jsonb_build_object('user_id',id,'role',role,'terminal',true)) INTO rec FROM users WHERE id=NEW.mentor_id;
          PERFORM notification_capture('LEAVE_MAKEUP','MENTOR_LEAVE_'||NEW.status,'LEAVE',NEW.id,NEW.version::text,rec,NEW.reviewed_by);
        END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER trg_notification_leave AFTER INSERT OR UPDATE ON mentor_leave_requests FOR EACH ROW EXECUTE FUNCTION capture_notification_leave();
      CREATE FUNCTION capture_notification_placement() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE rec jsonb; t text; BEGIN
        IF TG_OP='INSERT' AND NEW.status='ASSIGNED' THEN t='MAKEUP_PLACEMENT_CREATED';
        ELSIF NEW.status='CANCELLED' AND OLD.status<>'CANCELLED' THEN t='MAKEUP_PLACEMENT_CANCELLED';
        ELSE RETURN NEW; END IF;
        SELECT jsonb_agg(to_jsonb(x)||jsonb_build_object('terminal',t='MAKEUP_PLACEMENT_CANCELLED')) INTO rec FROM (
          SELECT user_id,role FROM notification_session_recipients(NEW.target_session_id) WHERE role='MENTOR'
          UNION SELECT id,role::text FROM users WHERE id=NEW.student_id) x;
        PERFORM notification_capture('LEAVE_MAKEUP',t,'MAKEUP',NEW.id,NEW.version::text,rec,
          NULLIF(current_setting('mindy.actor_id',true),'')::uuid,NEW.target_session_id);
        RETURN NEW;
      END $$;
      CREATE TRIGGER aaa_notification_placement BEFORE INSERT OR UPDATE ON makeup_placements FOR EACH ROW EXECUTE FUNCTION capture_notification_placement();
      CREATE FUNCTION capture_notification_material() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE rec jsonb; BEGIN
        IF NEW.review_status IS DISTINCT FROM OLD.review_status AND NEW.review_status IN ('APPROVED','REJECTED') THEN
          SELECT jsonb_agg(jsonb_build_object('user_id',id,'role',role,'terminal',true)) INTO rec FROM users WHERE id=NEW.created_by AND role='MENTOR';
          PERFORM notification_capture('MATERIAL','MATERIAL_REVIEW_'||NEW.review_status::text,'MATERIAL',NEW.id,NEW.revision::text,rec,NEW.reviewed_by,NEW.created_in_class_id);
        END IF;
        IF NEW.published_at IS NOT NULL AND NEW.deleted_at IS NULL AND NEW.approved_revision=NEW.revision
          AND (OLD.published_at IS NULL OR NEW.approved_revision IS DISTINCT FROM OLD.approved_revision) THEN
          SELECT jsonb_agg(to_jsonb(x)) INTO rec FROM notification_material_recipients(NEW.id) x;
          PERFORM notification_capture('MATERIAL','MATERIAL_PUBLISHED','MATERIAL',NEW.id,NEW.revision::text,rec,NEW.reviewed_by,NULL,
            GREATEST(NEW.available_at,NEW.published_at));
        END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER trg_notification_material AFTER UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION capture_notification_material();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    // Never silently discard a durable inbox/outbox or its deduplication markers.
    await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM notification_events) THEN
      RAISE EXCEPTION 'Notification history exists; disable delivery and retain schema'; END IF; END $$`);
    for (const [table, trigger, fn] of [
      ['materials', 'trg_notification_material', 'capture_notification_material'],
      ['makeup_placements', 'aaa_notification_placement', 'capture_notification_placement'],
      ['mentor_leave_requests', 'trg_notification_leave', 'capture_notification_leave'],
      ['assignment_zip_submissions', 'trg_notification_zip', 'capture_notification_zip'],
      ['assignments', 'aaa_notification_assignment', 'capture_notification_assignment'],
      ['orders', 'aaa_notification_order', 'capture_notification_order'],
      ['classes', 'aaa_notification_class', 'capture_notification_class'],
      ['class_sessions', 'aaa_notification_session', 'capture_notification_session'],
    ]) {
      await q.query(`DROP TRIGGER ${trigger} ON ${table}; DROP FUNCTION ${fn}()`);
    }
    await q.query(`DROP FUNCTION notification_capture(text,text,text,uuid,text,jsonb,uuid,uuid,timestamptz);
      DROP FUNCTION notification_relation_keys(uuid,uuid,text,uuid);
      DROP FUNCTION notification_material_recipients(uuid),notification_assignment_mentors(uuid),
        notification_assignment_recipients(uuid),notification_session_recipients(uuid);
      ALTER TABLE notifications DROP CONSTRAINT ck_notification_shape,DROP CONSTRAINT uq_notification_event,
        DROP COLUMN event_id,ALTER COLUMN actor_id SET NOT NULL,ALTER COLUMN message_id SET NOT NULL,
        ALTER COLUMN conversation_id SET NOT NULL,ADD CONSTRAINT notifications_type_check CHECK(type='CHAT_MESSAGE');
      DROP TABLE notification_recipients,notification_events,notification_producers`);
    await q.query(`ALTER TABLE class_sessions DROP COLUMN notification_schedule_revision;
      DROP INDEX idx_notification_assignments_due,idx_notification_sessions_due;
      ALTER TABLE assignments DROP COLUMN notification_deadline_revision;
      ALTER TABLE orders DROP COLUMN notification_expiry_revision`);
    await q.query(`DROP TRIGGER aaa_notification_entitlement ON enrollments; DROP FUNCTION advance_notification_entitlement();
      ALTER TABLE enrollments DROP COLUMN notification_entitlement_revision`);
  }
}
