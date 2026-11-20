import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource, type EntityManager } from 'typeorm';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ClassReadService } from '../../classes/services/class-read.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { UsersService } from '../../users/users.service.js';
import { canonicalPair } from '../domain/chat-access.js';
import { ChatException } from '../exceptions/chat.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatAccessService, type ConversationRow } from './chat-access.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatEventService } from './chat-event.service.js';

@Injectable()
export class ChatLifecycleService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ChatAccessService,
    private readonly classes: ClassReadService,
    private readonly users: UsersService,
    private readonly events: ChatEventService,
  ) {}
  async reconcileClass(classId: string): Promise<void> {
    await this.db.transaction(async (m) => {
      await this.classes.lockChatScopes(m, [classId]);
      const scope = (await this.classes.chatScopes(m, [classId]))[0];
      if (!scope) return;
      await m.query(
        `INSERT INTO chat_conversations(type,class_id) VALUES('CLASS',$1) ON CONFLICT(class_id) DO NOTHING`,
        [classId],
      );
      const rows: ConversationRow[] = await m.query(
        'SELECT * FROM chat_conversations WHERE class_id=$1 FOR UPDATE',
        [classId],
      );
      const conversation = rows[0];
      if (!conversation) return;
      const relations = await this.access.relations(m, [classId]);
      const ids = [...new Set([scope.mentorId, ...relations.map((r) => r.studentId)])].sort();
      const users = await this.users.findByIds(ids, m);
      const allowed: string[] = [];
      for (const user of users) {
        const mode = await this.access.sourceMode(
          m,
          { userId: user.id, role: user.role },
          conversation,
        );
        if (mode === 'NONE') continue;
        allowed.push(user.id);
        await this.join(m, conversation, user.id);
      }
      await m.query(
        `UPDATE chat_members SET left_at=clock_timestamp(),entitlement_version=entitlement_version+1
        WHERE conversation_id=$1 AND left_at IS NULL AND NOT(user_id=ANY($2::uuid[]))`,
        [conversation.id, allowed],
      );
      const changes: unknown[] = await m.query(
        'SELECT 1 FROM chat_members WHERE conversation_id=$1 AND entitlement_version>announced_version LIMIT 1',
        [conversation.id],
      );
      if (changes.length) {
        const sequence = await this.events.nextSequence(m, conversation.id);
        await this.events.append(m, {
          conversationId: conversation.id,
          sequence,
          type: 'conversation:membership-changed',
          messageId: null,
          actorId: null,
          recipientIds: allowed,
        });
        await m.query(
          'UPDATE chat_members SET announced_version=entitlement_version WHERE conversation_id=$1',
          [conversation.id],
        );
      }
    });
    // DM ensure has its own ordered transaction; never acquire another conversation while holding this one.
    const scope = (await this.classes.chatScopes(this.db.manager, [classId]))[0];
    if (!scope) return;
    const relations = await this.access.relations(this.db.manager, [classId]);
    for (const studentId of [...new Set(relations.map((r) => r.studentId))].sort()) {
      try {
        await this.ensureDirect(scope.mentorId, studentId);
      } catch (e) {
        if (!(e instanceof ChatException) || ![403, 404].includes(e.getStatus())) throw e;
      }
    }
  }
  async ensureDirect(actorId: string, peerId: string): Promise<{ id: string; created: boolean }> {
    this.access.enabled();
    if (actorId === peerId) throw new ChatException(422, 'CHAT_INVALID_INPUT');
    const [low, high] = canonicalPair(actorId, peerId);
    return this.db.transaction(async (m) => {
      // Pair advisory lock also serializes first creation, where a conversation row does not exist yet.
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,6))', [`${low}/${high}`]);
      const users = await this.users.findByIds([low, high], m),
        actor = users.find((u) => u.id === actorId);
      if (!actor) throw new ChatException(404, 'CHAT_NOT_FOUND');
      const prior: ConversationRow[] = await m.query(
        `SELECT * FROM chat_conversations WHERE user_low=$1 AND user_high=$2 FOR UPDATE`,
        [low, high],
      );
      const virtual: ConversationRow = prior[0] ?? {
        id: '',
        type: 'DIRECT',
        class_id: null,
        user_low: low,
        user_high: high,
        last_event_seq: '0',
        created_at: new Date(),
        updated_at: new Date(),
      };
      const mode = await this.access.sourceMode(m, { userId: actorId, role: actor.role }, virtual);
      if (mode === 'NONE') throw new ChatException(404, 'CHAT_NOT_FOUND');
      if (!prior[0] && mode !== 'WRITE') throw new ChatException(403, 'CHAT_READ_ONLY');
      const created = !prior[0];
      const row =
        prior[0] ??
        (
          (await m.query(
            `INSERT INTO chat_conversations(type,user_low,user_high)
        VALUES('DIRECT',$1,$2) RETURNING *`,
            [low, high],
          )) as ConversationRow[]
        )[0];
      if (!row) throw new Error('Direct creation failed');
      await this.join(m, row, low);
      await this.join(m, row, high);
      return { id: row.id, created };
    });
  }
  private async join(m: EntityManager, c: ConversationRow, userId: string): Promise<void> {
    await m.query(
      `INSERT INTO chat_members(conversation_id,user_id,visible_from_seq,last_read_seq)
      VALUES($1,$2,$3,$4) ON CONFLICT(conversation_id,user_id) DO UPDATE
      SET joined_at=clock_timestamp(),left_at=NULL,entitlement_version=chat_members.entitlement_version+1,
      visible_from_seq=CASE WHEN $5='DIRECT' THEN chat_members.visible_from_seq ELSE $3::bigint END,
      last_read_seq=CASE WHEN $5='DIRECT' THEN chat_members.last_read_seq ELSE $4::bigint END
      WHERE chat_members.left_at IS NOT NULL`,
      [c.id, userId, (BigInt(c.last_event_seq) + 1n).toString(), c.last_event_seq, c.type],
    );
  }
  async backfill(
    afterId: string | null,
    limit: number,
    dryRun = true,
  ): Promise<{ ids: string[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('Batch limit must be 1..100');
    const ids = await this.classes.chatClassIds(
      this.db.manager,
      undefined,
      afterId ?? undefined,
      limit,
    );
    if (!dryRun) for (const id of ids) await this.reconcileClass(id);
    return { ids, nextCursor: ids.length === limit ? (ids.at(-1) ?? null) : null };
  }
}
