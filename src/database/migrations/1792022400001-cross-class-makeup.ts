import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Attendance owns placements/guest history; schedule projections are shared read contracts. */
export class CrossClassMakeup1792022400001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE enrollments ADD CONSTRAINT uq_enrollment_makeup_identity UNIQUE(id,student_id,class_id);
      CREATE TABLE student_schedule_conflicts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
      source_session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
      conflicting_intervals jsonb NOT NULL DEFAULT '[]',
      status varchar(30) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','MAKEUP_ASSIGNED','RESOLVED')),
      version integer NOT NULL DEFAULT 1 CHECK(version > 0),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_student_schedule_conflict UNIQUE(enrollment_id,source_session_id),
      CONSTRAINT uq_schedule_conflict_identity UNIQUE(id,enrollment_id,source_session_id));
      CREATE INDEX idx_student_schedule_conflicts_queue ON student_schedule_conflicts(status,created_at,id);
      CREATE TABLE makeup_placements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conflict_id uuid NOT NULL REFERENCES student_schedule_conflicts(id) ON DELETE RESTRICT,
      enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      source_class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      source_session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
      source_root_session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
      target_class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      target_session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
      course_unit_id uuid NOT NULL REFERENCES course_units(id) ON DELETE RESTRICT,
      content_match_confirmed boolean NOT NULL CHECK(content_match_confirmed),
      reason varchar(1000) NOT NULL CHECK(length(trim(reason)) > 0),
      status varchar(30) NOT NULL DEFAULT 'ASSIGNED'
        CHECK(status IN ('ASSIGNED','COMPLETED','CANCELLED','NEEDS_REASSIGNMENT')),
      version integer NOT NULL DEFAULT 1 CHECK(version > 0),
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_makeup_different_class CHECK(source_class_id <> target_class_id),
      CONSTRAINT fk_makeup_conflict_identity FOREIGN KEY(conflict_id,enrollment_id,source_session_id)
        REFERENCES student_schedule_conflicts(id,enrollment_id,source_session_id) ON DELETE RESTRICT,
      CONSTRAINT fk_makeup_enrollment_identity FOREIGN KEY(enrollment_id,student_id,source_class_id)
        REFERENCES enrollments(id,student_id,class_id) ON DELETE RESTRICT,
      CONSTRAINT fk_makeup_source_class FOREIGN KEY(source_session_id,source_class_id)
        REFERENCES class_sessions(id,class_id) ON DELETE RESTRICT,
      CONSTRAINT fk_makeup_target_class FOREIGN KEY(target_session_id,target_class_id)
        REFERENCES class_sessions(id,class_id) ON DELETE RESTRICT,
      CONSTRAINT uq_makeup_guest_identity UNIQUE(id,target_session_id,enrollment_id,student_id));
      CREATE UNIQUE INDEX uq_makeup_source_obligation ON makeup_placements(enrollment_id,source_root_session_id)
        WHERE status <> 'CANCELLED';
      CREATE UNIQUE INDEX uq_makeup_student_target ON makeup_placements(student_id,target_session_id)
        WHERE status <> 'CANCELLED';
      CREATE INDEX idx_makeup_target_reservations ON makeup_placements(target_class_id,target_session_id,status);
      CREATE INDEX idx_makeup_source_unresolved ON makeup_placements(source_class_id,status);
      CREATE INDEX idx_makeup_student_history ON makeup_placements(student_id,created_at,id);
      CREATE INDEX idx_makeup_conflict ON makeup_placements(conflict_id);
      CREATE TABLE makeup_placement_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      placement_id uuid NOT NULL REFERENCES makeup_placements(id) ON DELETE RESTRICT,
      actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      old_status varchar(30), new_status varchar(30) NOT NULL,
      reason varchar(1000) NOT NULL, version integer NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX idx_makeup_audits_placement ON makeup_placement_audits(placement_id,occurred_at,id);
      CREATE TABLE guest_attendance_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), placement_id uuid NOT NULL UNIQUE,
      session_id uuid NOT NULL, enrollment_id uuid NOT NULL, student_id uuid NOT NULL,
      status attendance_status_enum NOT NULL DEFAULT 'UNMARKED',
      checked_in_at timestamptz, admitted_at timestamptz NOT NULL,
      recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT fk_guest_placement_identity FOREIGN KEY(placement_id,session_id,enrollment_id,student_id)
        REFERENCES makeup_placements(id,target_session_id,enrollment_id,student_id) ON DELETE RESTRICT);
      CREATE INDEX idx_guest_attendance_session ON guest_attendance_records(session_id,status);
      CREATE TABLE guest_attendance_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      attendance_id uuid NOT NULL REFERENCES guest_attendance_records(id) ON DELETE RESTRICT,
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      old_status attendance_status_enum, new_status attendance_status_enum NOT NULL,
      reason varchar(1000), action varchar(30) NOT NULL, version integer NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX idx_guest_audits_record ON guest_attendance_audits(attendance_id,occurred_at,id);
      CREATE TABLE makeup_mutation_receipts (
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      route varchar(200) NOT NULL, key uuid NOT NULL, payload_hash varchar(64) NOT NULL,
      outcome jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(actor_id,route,key));`);
    await q.query(`CREATE FUNCTION protect_makeup_placement() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='UPDATE' AND ROW(NEW.conflict_id,NEW.enrollment_id,NEW.student_id,NEW.source_class_id,
          NEW.source_session_id,NEW.source_root_session_id,NEW.target_class_id,NEW.target_session_id,
          NEW.course_unit_id,NEW.content_match_confirmed,NEW.created_by)
          IS DISTINCT FROM ROW(OLD.conflict_id,OLD.enrollment_id,OLD.student_id,OLD.source_class_id,
          OLD.source_session_id,OLD.source_root_session_id,OLD.target_class_id,OLD.target_session_id,
          OLD.course_unit_id,OLD.content_match_confirmed,OLD.created_by) THEN
          RAISE EXCEPTION 'Placement identity is immutable' USING ERRCODE='23514';
        END IF;
        IF NOT EXISTS(SELECT 1 FROM enrollments e
          JOIN student_schedule_conflicts f ON f.id=NEW.conflict_id AND f.enrollment_id=e.id
          JOIN class_sessions s ON s.id=f.source_session_id
          JOIN class_units su ON su.id=s.class_unit_id
          JOIN class_sessions t ON t.id=NEW.target_session_id
          JOIN class_units tu ON tu.id=t.class_unit_id
          WHERE e.id=NEW.enrollment_id AND e.student_id=NEW.student_id AND e.class_id=NEW.source_class_id
            AND su.class_id=e.class_id AND s.id=NEW.source_session_id
            AND COALESCE(s.makeup_root_session_id,s.id)=NEW.source_root_session_id
            AND tu.class_id=NEW.target_class_id AND su.course_unit_id=NEW.course_unit_id
            AND tu.course_unit_id=NEW.course_unit_id) THEN
          RAISE EXCEPTION 'Placement ancestry or Course Unit mismatch' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_makeup_placement BEFORE INSERT OR UPDATE ON makeup_placements
        FOR EACH ROW EXECUTE FUNCTION protect_makeup_placement();
      CREATE FUNCTION protect_makeup_session_unit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.class_unit_id IS DISTINCT FROM OLD.class_unit_id AND EXISTS(SELECT 1 FROM makeup_placements
          WHERE source_session_id=OLD.id OR target_session_id=OLD.id) THEN
          RAISE EXCEPTION 'Session unit has makeup history' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_makeup_session_unit BEFORE UPDATE OF class_unit_id ON class_sessions
        FOR EACH ROW EXECUTE FUNCTION protect_makeup_session_unit();
      CREATE FUNCTION protect_makeup_course_unit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.course_unit_id IS DISTINCT FROM OLD.course_unit_id AND EXISTS(SELECT 1 FROM class_sessions s
          JOIN makeup_placements p ON p.source_session_id=s.id OR p.target_session_id=s.id
          WHERE s.class_unit_id=OLD.id) THEN
          RAISE EXCEPTION 'Class unit has makeup history' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_makeup_course_unit BEFORE UPDATE OF course_unit_id ON class_units
        FOR EACH ROW EXECUTE FUNCTION protect_makeup_course_unit();
      CREATE FUNCTION protect_guest_attendance_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF ROW(NEW.placement_id,NEW.session_id,NEW.enrollment_id,NEW.student_id)
          IS DISTINCT FROM ROW(OLD.placement_id,OLD.session_id,OLD.enrollment_id,OLD.student_id) THEN
          RAISE EXCEPTION 'Guest snapshot identity is immutable' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_guest_attendance_identity BEFORE UPDATE ON guest_attendance_records
        FOR EACH ROW EXECUTE FUNCTION protect_guest_attendance_identity();
      CREATE FUNCTION requeue_cancelled_makeup_target() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE p makeup_placements%ROWTYPE;
      BEGIN
        IF NEW.status='CANCELLED' AND OLD.status IS DISTINCT FROM NEW.status THEN
          UPDATE student_schedule_conflicts f SET status='RESOLVED',version=version+1,updated_at=now()
            WHERE f.source_session_id=NEW.id AND f.status='OPEN' AND NOT EXISTS(
              SELECT 1 FROM makeup_placements existing_placement
              WHERE existing_placement.conflict_id=f.id AND existing_placement.status<>'CANCELLED');
          FOR p IN UPDATE makeup_placements SET status='NEEDS_REASSIGNMENT',version=version+1,updated_at=now()
            WHERE target_session_id=NEW.id AND status IN ('ASSIGNED','COMPLETED') RETURNING * LOOP
            UPDATE student_schedule_conflicts SET status='OPEN',version=version+1,updated_at=now()
              WHERE id=p.conflict_id;
            INSERT INTO makeup_placement_audits(placement_id,actor_id,old_status,new_status,reason,version)
              VALUES(p.id,NULLIF(current_setting('mindy.actor_id',true),'')::uuid,
                CASE WHEN OLD.status='COMPLETED' THEN 'COMPLETED' ELSE 'ASSIGNED' END,
                'NEEDS_REASSIGNMENT','Target session cancelled',p.version);
          END LOOP;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_requeue_makeup_target AFTER UPDATE OF status ON class_sessions
        FOR EACH ROW EXECUTE FUNCTION requeue_cancelled_makeup_target();`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM makeup_placements) OR EXISTS(SELECT 1 FROM student_schedule_conflicts)
        OR EXISTS(SELECT 1 FROM makeup_mutation_receipts) THEN
        RAISE EXCEPTION 'Makeup history exists; retain schema and roll back application only';
      END IF;
    END $$;
      DROP TRIGGER trg_requeue_makeup_target ON class_sessions;
      DROP FUNCTION requeue_cancelled_makeup_target();
      DROP TRIGGER trg_makeup_placement ON makeup_placements;
      DROP FUNCTION protect_makeup_placement();
      DROP TRIGGER trg_makeup_session_unit ON class_sessions;
      DROP FUNCTION protect_makeup_session_unit();
      DROP TRIGGER trg_makeup_course_unit ON class_units;
      DROP FUNCTION protect_makeup_course_unit();
      DROP TRIGGER trg_guest_attendance_identity ON guest_attendance_records;
      DROP FUNCTION protect_guest_attendance_identity();
      DROP TABLE makeup_mutation_receipts,guest_attendance_audits,guest_attendance_records,
        makeup_placement_audits,makeup_placements,student_schedule_conflicts;
      ALTER TABLE enrollments DROP CONSTRAINT uq_enrollment_makeup_identity;`);
  }
}
