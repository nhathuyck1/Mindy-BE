import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource } from 'typeorm';

/** Bounded scans skip already captured revisions; capture and event-time recipients share a transaction. */
@Injectable()
export class NotificationRemindersService {
  constructor(private readonly db: DataSource) {}
  async capture(): Promise<void> {
    await this.db.transaction(async (m) => {
      await m.query(`SELECT notification_capture('PAYMENT','ORDER_EXPIRING','ORDER',o.id,o.notification_expiry_revision::text,
        jsonb_build_array(jsonb_build_object('user_id',o.student_id,'role','STUDENT')))
        FROM (SELECT o.* FROM orders o JOIN notification_producers p ON p.name='PAYMENT' AND p.activated_at IS NOT NULL
          WHERE o.status='PENDING' AND o.expires_at>clock_timestamp() AND o.expires_at<=clock_timestamp()+interval '24 hours'
          AND NOT EXISTS(SELECT 1 FROM notification_events e WHERE e.event_key=p.epoch::text||':ORDER_EXPIRING:'||o.id::text||':'||o.notification_expiry_revision::text)
          ORDER BY o.expires_at,o.id LIMIT 100 FOR UPDATE OF o SKIP LOCKED) o`);
      await m.query(`SELECT notification_capture('REMINDER','SESSION_STARTING_SOON','SESSION',s.id,s.notification_schedule_revision::text,
        (SELECT jsonb_agg(to_jsonb(x)) FROM notification_session_recipients(s.id) x),NULL,s.class_id)
        FROM (SELECT s.* FROM class_sessions s JOIN notification_producers p ON p.name='REMINDER' AND p.activated_at IS NOT NULL
          JOIN classes c ON c.id=s.class_id WHERE s.status='SCHEDULED' AND c.status IN ('OPEN','IN_PROGRESS')
          AND s.starts_at>clock_timestamp() AND s.starts_at<=clock_timestamp()+interval '30 minutes'
          AND NOT EXISTS(SELECT 1 FROM notification_events e WHERE e.event_key=p.epoch::text||':SESSION_STARTING_SOON:'||s.id::text||':'||s.notification_schedule_revision::text)
          ORDER BY s.starts_at,s.id LIMIT 100 FOR UPDATE OF s SKIP LOCKED) s`);
      await m.query(`SELECT notification_capture('REMINDER','ASSIGNMENT_DUE_SOON','ASSIGNMENT',a.id,a.notification_deadline_revision::text,
        (SELECT jsonb_agg(to_jsonb(x)) FROM notification_assignment_recipients(a.id) x))
        FROM (SELECT a.* FROM assignments a JOIN notification_producers p ON p.name='REMINDER' AND p.activated_at IS NOT NULL
          WHERE a.status='PUBLISHED' AND a.deleted_at IS NULL AND a.due_at>clock_timestamp() AND a.due_at<=clock_timestamp()+interval '24 hours'
          AND NOT EXISTS(SELECT 1 FROM notification_events e WHERE e.event_key=p.epoch::text||':ASSIGNMENT_DUE_SOON:'||a.id::text||':'||a.notification_deadline_revision::text)
          ORDER BY a.due_at,a.id LIMIT 100 FOR UPDATE OF a SKIP LOCKED) a`);
    });
  }
}
