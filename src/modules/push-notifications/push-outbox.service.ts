import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
// biome-ignore lint/style/useImportType: Nest DI token.
import { PushConfig } from './push-config.service.js';

@Injectable()
export class PushOutbox {
  constructor(private readonly config: PushConfig) {}
  async enqueue(m: EntityManager, messageId: string, userId: string): Promise<void> {
    if (!this.config.enabled) return;
    // Eligibility/history are established by fanout. Registration never backfills history.
    await m.query(
      `INSERT INTO notification_push_deliveries(notification_id,installation_id,installation_generation,expires_at)
      SELECT n.id,i.id,i.generation,x.created_at+make_interval(secs=>$4)
      FROM notifications n JOIN chat_messages x ON x.id=n.message_id
      JOIN push_installations i ON i.user_id=n.user_id AND i.status='ACTIVE'
      JOIN auth_sessions s ON s.id=i.session_id AND s.user_id=i.user_id AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
      WHERE n.message_id=$1 AND n.user_id=$2 AND n.read_at IS NULL AND x.deleted_at IS NULL
      AND x.created_at>=$3::timestamptz AND x.created_at+make_interval(secs=>$4)>clock_timestamp()
      AND i.generation_started_at<=n.created_at AND i.last_seen_at>clock_timestamp()-interval '30 days'
      AND NOT EXISTS(SELECT 1 FROM notification_push_deliveries prior WHERE prior.notification_id=n.id AND prior.installation_id=i.id)
      ON CONFLICT(notification_id,installation_id,installation_generation) DO NOTHING`,
      [messageId, userId, this.config.cutoff, this.config.ttl],
    );
  }
}
