import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import type { ChatPage, NotificationQuery } from '../dtos/chat.dto.js';
import { ChatException } from '../exceptions/chat.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatAccessService, type ConversationRow } from './chat-access.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatCursorService } from './chat-cursor.service.js';
import type { ChatJob } from './chat-jobs.service.js';

export interface NotificationDto {
  id: string;
  type: 'CHAT_MESSAGE';
  actorId: string;
  conversationId: string;
  messageId: string;
  title: string;
  body: string;
  data: { conversationId: string; messageId: string };
  readAt: string | null;
  createdAt: string;
}
interface NotificationRow {
  id: string;
  user_id: string;
  actor_id: string;
  conversation_id: string;
  message_id: string;
  read_at: Date | null;
  created_at: Date;
}

@Injectable()
export class ChatNotificationsService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ChatAccessService,
    private readonly cursors: ChatCursorService,
  ) {}
  async fanout(job: ChatJob): Promise<void> {
    const rows: { conversation_id: string; message_id: string; actor_id: string; type: string }[] =
      await this.db.query('SELECT * FROM chat_events WHERE id=$1', [job.event_id]);
    const event = rows[0];
    if (event?.type !== 'message:created') return;
    await this.db.transaction(async (m) => {
      // Serialize against read cursors so read-before-fanout creates a read notification.
      await m.query('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE', [
        event.conversation_id,
      ]);
      const conversations: ConversationRow[] = await m.query(
        'SELECT * FROM chat_conversations WHERE id=$1',
        [event.conversation_id],
      );
      const conversation = conversations[0];
      if (!conversation) return;
      const allowed = new Set(await this.access.recipients(m, conversation));
      for (const id of job.recipient_ids) {
        if (id === event.actor_id || !allowed.has(id)) continue;
        await m.query(
          `INSERT INTO notifications(user_id,actor_id,conversation_id,message_id,read_at)
          SELECT $1,$2,x.conversation_id,x.id,CASE WHEN member.last_read_seq>=x.sequence THEN clock_timestamp() ELSE NULL END
          FROM chat_messages x JOIN chat_members member ON member.conversation_id=x.conversation_id AND member.user_id=$1
          WHERE x.id=$3 AND x.deleted_at IS NULL AND member.left_at IS NULL AND x.sequence>=member.visible_from_seq
          ON CONFLICT(user_id,type,message_id) DO NOTHING`,
          [id, event.actor_id, event.message_id],
        );
      }
    });
  }
  async list(actor: AuthenticatedUser, q: NotificationQuery): Promise<ChatPage<NotificationDto>> {
    this.access.enabled();
    const scope = `notifications/${q.unreadOnly ?? false}`,
      cursor = q.cursor ? this.cursors.decode(q.cursor, actor.userId, scope) : null;
    const rows = await this.visible(
      actor,
      cursor?.position ?? '',
      q.limit + 1,
      q.unreadOnly ?? false,
    );
    const data = rows.slice(0, q.limit).map((r) => this.dto(r)),
      hasMore = rows.length > q.limit;
    return {
      data,
      meta: {
        hasMore,
        nextCursor: hasMore
          ? this.cursors.encode(
              actor.userId,
              scope,
              `${data.at(-1)?.createdAt}|${data.at(-1)?.id}`,
              '',
            )
          : null,
      },
    };
  }
  async deliveries(job: ChatJob): Promise<{ userId: string; notification: NotificationDto }[]> {
    const rows: NotificationRow[] = await this.db.query(
      `SELECT n.* FROM notifications n
      JOIN chat_events e ON e.message_id=n.message_id JOIN chat_messages x ON x.id=n.message_id
      WHERE e.id=$1 AND x.deleted_at IS NULL AND n.user_id=ANY($2::uuid[])`,
      [job.event_id, job.recipient_ids],
    );
    return rows.map((row) => ({ userId: row.user_id, notification: this.dto(row) }));
  }
  async count(actor: AuthenticatedUser): Promise<{ unreadCount: number }> {
    this.access.enabled();
    const rows = await this.visible(actor, '', Number.MAX_SAFE_INTEGER);
    return { unreadCount: rows.filter((r) => !r.read_at).length };
  }
  async read(actor: AuthenticatedUser, id: string): Promise<NotificationDto> {
    this.access.enabled();
    const rows: NotificationRow[] = await this.db.query(
      'SELECT * FROM notifications WHERE id=$1 AND user_id=$2',
      [id, actor.userId],
    );
    const row = rows[0];
    if (!row) throw new ChatException(404, 'CHAT_NOT_FOUND');
    await this.access.authorize(this.db.manager, actor, row.conversation_id);
    const allowed = await this.visible(actor, '', Number.MAX_SAFE_INTEGER);
    if (!allowed.some((r) => r.id === id)) throw new ChatException(404, 'CHAT_NOT_FOUND');
    await this.db.query(
      'UPDATE notifications SET read_at=COALESCE(read_at,clock_timestamp()) WHERE id=$1 AND user_id=$2',
      [id, actor.userId],
    );
    const result: NotificationRow[] = await this.db.query(
      'SELECT * FROM notifications WHERE id=$1',
      [id],
    );
    const updated = result[0];
    if (!updated) throw new ChatException(404, 'CHAT_NOT_FOUND');
    return this.dto(updated);
  }
  async readAll(actor: AuthenticatedUser): Promise<{ readAt: string; resyncRequired: true }> {
    this.access.enabled();
    // Snapshot IDs, not a broad timestamp UPDATE: later committed fanout stays unread.
    const ids = (await this.visible(actor, '', Number.MAX_SAFE_INTEGER))
      .filter((r) => !r.read_at)
      .map((r) => r.id);
    const rows: { now: Date }[] = await this.db.query('SELECT clock_timestamp() AS now');
    const now = rows[0]?.now ?? new Date();
    await this.db.query(
      'UPDATE notifications SET read_at=COALESCE(read_at,$3) WHERE user_id=$1 AND id=ANY($2::uuid[])',
      [actor.userId, ids, now],
    );
    return { readAt: now.toISOString(), resyncRequired: true };
  }
  private async visible(
    actor: AuthenticatedUser,
    after: string,
    take: number,
    unreadOnly = false,
  ): Promise<NotificationRow[]> {
    const result: NotificationRow[] = [];
    let position = after;
    for (;;) {
      const [time, lastId] = this.cursors.position(position);
      const rows: NotificationRow[] = await this.db.query(
        `SELECT n.* FROM notifications n JOIN chat_messages x ON x.id=n.message_id
        JOIN chat_members member ON member.conversation_id=n.conversation_id AND member.user_id=n.user_id
        WHERE n.user_id=$1 AND ($2::timestamptz IS NULL OR (n.created_at,n.id)<($2,$3::uuid)) AND n.created_at>=clock_timestamp()-interval '90 days'
        AND x.deleted_at IS NULL AND x.sequence>=member.visible_from_seq AND member.left_at IS NULL
        AND (NOT $4::boolean OR n.read_at IS NULL) ORDER BY n.created_at DESC,n.id DESC LIMIT 100`,
        [actor.userId, time, lastId, unreadOnly],
      );
      for (const row of rows) {
        try {
          await this.access.authorize(this.db.manager, actor, row.conversation_id);
          result.push(row);
        } catch (e) {
          if (!(e instanceof ChatException) || ![404, 503].includes(e.getStatus())) throw e;
        }
        if (result.length >= take) return result;
      }
      if (rows.length < 100) return result;
      const last = rows.at(-1);
      if (last) position = `${last.created_at.toISOString()}|${last.id}`;
    }
  }
  private dto(r: NotificationRow): NotificationDto {
    return {
      id: r.id,
      type: 'CHAT_MESSAGE',
      actorId: r.actor_id,
      conversationId: r.conversation_id,
      messageId: r.message_id,
      title: 'Tin nhắn mới',
      body: 'Bạn có tin nhắn mới.',
      data: { conversationId: r.conversation_id, messageId: r.message_id },
      readAt: r.read_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
    };
  }
}
