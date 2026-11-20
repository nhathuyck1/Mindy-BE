import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import {
  isBusinessType,
  NOTIFICATION_CATALOG,
  type NotificationCategory,
} from '../domain/notification-catalog.js';
import {
  NotificationDto,
  type NotificationQuery,
  type NotificationRow,
} from '../dtos/notification.dto.js';
import { NotificationException } from '../exceptions/notification.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { NotificationCursorService } from './notification-cursor.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import {
  NotificationPolicyService,
  type NotificationVisibility,
} from './notification-policy.service.js';

export const NOTIFICATION_SELECT = `SELECT n.*,e.resource_kind,e.resource_id,e.context_id,e.revision,
  r.role AS recipient_role,r.terminal,r.context_ids,r.relation_keys FROM notifications n
  LEFT JOIN notification_events e ON e.id=n.event_id
  LEFT JOIN notification_recipients r ON r.event_id=n.event_id AND r.user_id=n.user_id`;

@Injectable()
export class NotificationInboxService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly cursors: NotificationCursorService,
    private readonly policy: NotificationPolicyService,
  ) {}

  enabled(): void {
    if (!this.config.get<boolean>('NOTIFICATIONS_ENABLED', false))
      throw new NotificationException(503, 'NOTIFICATIONS_DISABLED');
  }

  async list(
    actor: AuthenticatedUser,
    q: NotificationQuery,
  ): Promise<{ data: NotificationDto[]; meta: { hasMore: boolean; nextCursor: string | null } }> {
    this.enabled();
    const scope = `${q.category}/${q.unreadOnly}`,
      after = q.cursor ? this.cursors.decode(q.cursor, actor.userId, scope) : '';
    const rows = await this.visible(actor, q.category, q.unreadOnly, after, q.limit + 1);
    const data = rows.slice(0, q.limit),
      last = data.at(-1),
      hasMore = rows.length > q.limit;
    return {
      data,
      meta: {
        hasMore,
        nextCursor:
          hasMore && last
            ? this.cursors.encode(actor.userId, scope, `${last.createdAt}|${last.id}`)
            : null,
      },
    };
  }

  async count(
    actor: AuthenticatedUser,
    category: 'ALL' | 'BUSINESS',
  ): Promise<{ unreadCount: number }> {
    this.enabled();
    // Repeated changes to the same resource share current visibility. Count each policy
    // group once rather than project thousands of identical DTOs or trust a stale counter.
    const types = Object.keys(NOTIFICATION_CATALOG);
    if (category === 'ALL') types.push('CHAT_MESSAGE');
    const groups: (NotificationRow & { weight: number })[] = await this.db.query(
      `WITH candidates AS (
      ${NOTIFICATION_SELECT} WHERE n.user_id=$1 AND n.read_at IS NULL AND n.type=ANY($2::text[])
      AND n.created_at>=clock_timestamp()-interval '90 days'
    ), scoped AS (SELECT *,CASE WHEN type IN ('SESSION_STARTING_SOON','ASSIGNMENT_DUE_SOON','ORDER_EXPIRING')
      THEN revision ELSE NULL END AS policy_revision FROM candidates)
    SELECT min(id::text)::uuid AS id,user_id,type,actor_id,conversation_id,message_id,NULL::timestamptz AS read_at,
      min(created_at) AS created_at,NULL::uuid AS event_id,resource_kind,resource_id,context_id,context_ids,relation_keys,
      recipient_role,terminal,policy_revision AS revision,count(*)::int AS weight FROM scoped
    GROUP BY user_id,type,actor_id,conversation_id,message_id,resource_kind,resource_id,context_id,context_ids,
      relation_keys,recipient_role,terminal,policy_revision`,
      [actor.userId, types],
    );
    let unreadCount = 0;
    try {
      for (let offset = 0; offset < groups.length; offset += 1000) {
        const batch = groups.slice(offset, offset + 1000),
          visibility = await this.policy.checkBatch(this.db.manager, actor, batch);
        for (const group of batch)
          if (visibility.get(group.id)?.visible) unreadCount += group.weight;
      }
    } catch {
      throw new NotificationException(503, 'NOTIFICATION_POLICY_UNAVAILABLE');
    }
    return { unreadCount };
  }

  async get(
    actor: AuthenticatedUser,
    id: string,
    m: EntityManager = this.db.manager,
  ): Promise<NotificationDto> {
    this.enabled();
    const rows: NotificationRow[] = await m.query(
      `${NOTIFICATION_SELECT} WHERE n.id=$1 AND n.user_id=$2 AND n.created_at>=clock_timestamp()-interval '90 days'`,
      [id, actor.userId],
    );
    const row = rows[0],
      dto = row ? await this.project(actor, row, m) : null;
    if (!dto) throw new NotificationException(404, 'NOTIFICATION_NOT_FOUND');
    return dto;
  }

  async read(actor: AuthenticatedUser, id: string): Promise<NotificationDto> {
    return this.db.transaction(async (m) => {
      await this.get(actor, id, m);
      await m.query(
        'UPDATE notifications SET read_at=COALESCE(read_at,clock_timestamp()) WHERE id=$1 AND user_id=$2',
        [id, actor.userId],
      );
      return this.get(actor, id, m);
    });
  }

  async readAll(
    actor: AuthenticatedUser,
    category: 'ALL' | 'BUSINESS',
  ): Promise<{ readAt: string; resyncRequired: true }> {
    this.enabled();
    const ids = (await this.visible(actor, category, true, '', Number.MAX_SAFE_INTEGER)).map(
      (r) => r.id,
    );
    const rows: { read_at: Date }[] = await this.db.query(
      `WITH stamp AS (SELECT clock_timestamp() AS t), updated AS (
      UPDATE notifications SET read_at=COALESCE(read_at,stamp.t) FROM stamp WHERE user_id=$1 AND id=ANY($2::uuid[]) RETURNING id)
      SELECT t AS read_at FROM stamp`,
      [actor.userId, ids],
    );
    return { readAt: (rows[0]?.read_at ?? new Date()).toISOString(), resyncRequired: true };
  }

  async project(
    actor: AuthenticatedUser,
    r: NotificationRow,
    m: EntityManager = this.db.manager,
    checked?: NotificationVisibility,
  ): Promise<NotificationDto | null> {
    let visibility: NotificationVisibility;
    try {
      visibility = checked ?? (await this.policy.check(m, actor, r));
    } catch {
      throw new NotificationException(503, 'NOTIFICATION_POLICY_UNAVAILABLE');
    }
    if (!visibility.visible) return null;
    const chat = r.type === 'CHAT_MESSAGE';
    if (!chat && !isBusinessType(r.type)) return null;
    const [category, title, body] = isBusinessType(r.type)
      ? NOTIFICATION_CATALOG[r.type]
      : ['CHAT', 'Tin nhắn mới', 'Bạn có tin nhắn mới.'];
    const kind = chat ? 'CHAT' : (r.resource_kind ?? ''),
      id = chat ? r.conversation_id : r.resource_id;
    if (!id) return null;
    const data: Record<string, string> = {};
    if (chat && r.conversation_id && r.message_id) {
      data.conversationId = r.conversation_id;
      data.messageId = r.message_id;
    } else {
      const keys: Record<string, string> = {
        SESSION: 'sessionId',
        CLASS: 'classId',
        ORDER: 'orderId',
        LEAVE: 'leaveId',
        MAKEUP: 'placementId',
        ASSIGNMENT: 'assignmentId',
        SUBMISSION: 'submissionId',
        MATERIAL: 'materialId',
      };
      const key = keys[kind];
      if (key) data[key] = id;
      if (kind === 'SUBMISSION' && visibility.contextId) data.assignmentId = visibility.contextId;
    }
    return new NotificationDto({
      id: r.id,
      type: r.type,
      category,
      actorId: chat ? r.actor_id : null,
      conversationId: chat ? r.conversation_id : null,
      messageId: chat ? r.message_id : null,
      title,
      body,
      data,
      readAt: r.read_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
      target: {
        kind,
        id,
        available: visibility.available,
        ...(visibility.available && visibility.contextId
          ? { contextId: visibility.contextId }
          : {}),
      },
    });
  }

  private async visible(
    actor: AuthenticatedUser,
    category: NotificationCategory,
    unreadOnly: boolean,
    after: string,
    take: number,
  ): Promise<NotificationDto[]> {
    const result: NotificationDto[] = [];
    let position = after;
    // Start with the requested page; only widen the scan when policy hides rows.
    let batchSize = take > 100 ? 1000 : take;
    const types = Object.entries(NOTIFICATION_CATALOG)
      .filter(([, v]) => category === 'ALL' || category === 'BUSINESS' || v[0] === category)
      .map(([key]) => key);
    if (category === 'ALL' || category === 'CHAT') types.push('CHAT_MESSAGE');
    for (;;) {
      const [time, id] = this.cursors.position(position);
      const rows: NotificationRow[] = await this.db.query(
        `${NOTIFICATION_SELECT}
        WHERE n.user_id=$1 AND n.type=ANY($2::text[]) AND n.created_at>=clock_timestamp()-interval '90 days'
        AND (NOT $3::boolean OR n.read_at IS NULL) AND ($4::timestamptz IS NULL OR (n.created_at,n.id)<($4,$5::uuid))
        ORDER BY n.created_at DESC,n.id DESC LIMIT $6`,
        [actor.userId, types, unreadOnly, time, id, batchSize],
      );
      let visibility: Map<string, NotificationVisibility>;
      try {
        visibility = await this.policy.checkBatch(this.db.manager, actor, rows);
      } catch {
        throw new NotificationException(503, 'NOTIFICATION_POLICY_UNAVAILABLE');
      }
      for (const row of rows) {
        const dto = await this.project(
          actor,
          row,
          this.db.manager,
          visibility.get(row.id) ?? { visible: false, available: false },
        );
        if (dto) result.push(dto);
        if (result.length >= take) return result;
      }
      const last = rows.at(-1);
      if (rows.length < batchSize || !last) return result;
      position = `${last.created_at.toISOString()}|${last.id}`;
      batchSize = take > 100 ? 1000 : 100;
    }
  }
}
