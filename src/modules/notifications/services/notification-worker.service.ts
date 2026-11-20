import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import type { UserRole } from '../../users/user-role.enum.js';
import type { NotificationRow } from '../dtos/notification.dto.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { NotificationPolicyService } from './notification-policy.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { NotificationRemindersService } from './notification-reminders.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { NotificationSocketService } from './notification-socket.service.js';

interface Event {
  id: string;
  type: string;
  resource_kind: string;
  resource_id: string;
  context_id: string | null;
  revision: string;
  attempts: number;
}
interface Recipient {
  user_id: string;
  role: UserRole;
  terminal: boolean;
  context_ids: string[];
  relation_keys: string[];
}

@Injectable()
export class NotificationWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly policy: NotificationPolicyService,
    private readonly sockets: NotificationSocketService,
    private readonly reminders: NotificationRemindersService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>('NOTIFICATION_JOB_ENABLED', false)) return;
    this.timer = setInterval(() => {
      if (!this.running && !this.stopped)
        this.running = this.tick()
          .catch(() => {
            this.logger.warn('Notification worker iteration failed; durable jobs retained.');
          })
          .finally(() => {
            this.running = undefined;
          });
    }, 1000);
    this.timer.unref();
  }
  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  async tick(): Promise<void> {
    await this.db.query(`UPDATE notification_events e SET not_before=GREATEST(e.occurred_at,m.available_at,m.published_at)
      FROM materials m WHERE e.resource_id=m.id AND e.type='MATERIAL_PUBLISHED' AND e.status='PENDING'
      AND e.not_before IS DISTINCT FROM GREATEST(e.occurred_at,m.available_at,m.published_at)`);
    await this.db.query(`UPDATE notification_events SET status='DEAD',lease_id=NULL,lease_until=NULL,
      last_error='REPLAY_WINDOW_EXPIRED' WHERE status IN ('PENDING','PROCESSING')
      AND occurred_at<clock_timestamp()-interval '90 days' AND (lease_until IS NULL OR lease_until<clock_timestamp())`);
    await this.reminders.capture();
    const lease = randomUUID();
    const events: Event[] = await this.db.query(
      `WITH candidate AS (
      SELECT id FROM notification_events WHERE ((status='PENDING' AND available_at<=clock_timestamp())
        OR (status='PROCESSING' AND lease_until<clock_timestamp())) AND not_before<=clock_timestamp()
      ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1), claimed AS (
      UPDATE notification_events e SET status='PROCESSING',attempts=attempts+1,lease_id=$1,
        lease_until=clock_timestamp()+interval '60 seconds' FROM candidate c WHERE e.id=c.id RETURNING e.*)
        SELECT * FROM claimed`,
      [lease],
    );
    const event = events[0];
    if (!event) return;
    try {
      const deliveries = await this.db.transaction(async (m) => {
        // Lock and check the fencing token before checkpoints/inserts. Expired claims cannot complete a replacement lease.
        const ownership: unknown[] = await m.query(
          `SELECT id FROM notification_events WHERE id=$1 AND lease_id=$2 AND status='PROCESSING' FOR UPDATE`,
          [event.id, lease],
        );
        if (!ownership.length) return [];
        const recipients: Recipient[] = await m.query(
          `SELECT * FROM notification_recipients WHERE event_id=$1 AND processed_at IS NULL ORDER BY user_id LIMIT 100 FOR UPDATE`,
          [event.id],
        );
        const inserted: { userId: string; id: string }[] = [];
        for (const r of recipients) {
          const row: NotificationRow = {
            id: randomUUID(),
            user_id: r.user_id,
            type: event.type,
            actor_id: null,
            conversation_id: null,
            message_id: null,
            event_id: event.id,
            resource_kind: event.resource_kind,
            resource_id: event.resource_id,
            context_id: event.context_id,
            context_ids: r.context_ids,
            relation_keys: r.relation_keys,
            recipient_role: r.role,
            terminal: r.terminal,
            revision: event.revision,
            read_at: null,
            created_at: new Date(),
          };
          const actor: AuthenticatedUser = { userId: r.user_id, role: r.role, sessionId: '' };
          const visible = await this.policy.check(m, actor, row);
          if (visible.visible) {
            const rows: { id: string }[] = await m.query(
              `INSERT INTO notifications(id,user_id,type,event_id) VALUES($1,$2,$3,$4)
              ON CONFLICT(user_id,event_id) DO NOTHING RETURNING id`,
              [row.id, r.user_id, event.type, event.id],
            );
            if (rows[0]) inserted.push({ userId: r.user_id, id: rows[0].id });
          }
          await m.query(
            'UPDATE notification_recipients SET processed_at=clock_timestamp() WHERE event_id=$1 AND user_id=$2',
            [event.id, r.user_id],
          );
        }
        await m.query(
          `UPDATE notification_events SET status=CASE WHEN EXISTS(SELECT 1 FROM notification_recipients WHERE event_id=$1 AND processed_at IS NULL) THEN 'PENDING' ELSE 'DONE' END,
          completed_at=CASE WHEN NOT EXISTS(SELECT 1 FROM notification_recipients WHERE event_id=$1 AND processed_at IS NULL) THEN clock_timestamp() END,
          lease_id=NULL,lease_until=NULL,attempts=0,available_at=clock_timestamp(),last_error=NULL WHERE id=$1 AND lease_id=$2`,
          [event.id, lease],
        );
        return inserted;
      });
      // The transaction is committed before any transport call.
      for (const item of deliveries) await this.sockets.created(item.userId, item.id);
    } catch {
      await this.db.query(
        `UPDATE notification_events SET status=CASE WHEN attempts>=8 OR occurred_at<clock_timestamp()-interval '90 days' THEN 'DEAD' ELSE 'PENDING' END,
        available_at=clock_timestamp()+LEAST(300,power(2,LEAST(attempts,8))) * interval '1 second',lease_id=NULL,lease_until=NULL,last_error='DELIVERY_RETRY_REQUIRED'
        WHERE id=$1 AND lease_id=$2`,
        [event.id, lease],
      );
      this.logger.warn('Notification batch deferred; inspect durable job state.');
    }
  }
}
