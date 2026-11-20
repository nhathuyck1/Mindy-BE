import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource, type EntityManager } from 'typeorm';
// biome-ignore lint/style/useImportType: Nest DI token.
import { AuthService } from '../../auth/auth.service.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ClassReadService } from '../../classes/services/class-read.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { UsersService } from '../../users/users.service.js';
import type {
  ChatEventQuery,
  ChatPage,
  ChatPageQuery,
  ConversationDto,
  ConversationQuery,
  EditChatInput,
  MessageDto,
  SendChatInput,
} from '../dtos/chat.dto.js';
import { ChatException } from '../exceptions/chat.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import {
  type AuthorizedChat,
  ChatAccessService,
  type ConversationRow,
} from './chat-access.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatAttachmentsService } from './chat-attachments.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatCryptoService } from './chat-crypto.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatCursorService } from './chat-cursor.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatEventService } from './chat-event.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatRateService } from './chat-rate.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatReceiptService } from './chat-receipt.service.js';

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_message_id: string;
  type: 'TEXT' | 'FILE' | 'IMAGE';
  file_object_id: string | null;
  body_is_null: boolean;
  sequence: string;
  last_changed_seq: string;
  version: number;
  reply_to_id: string | null;
  ciphertext: Buffer | null;
  iv: Buffer | null;
  tag: Buffer | null;
  key_version: number | null;
  crypto_version: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}
export interface ChatEventDto {
  eventId: string;
  conversationId: string;
  sequence: string;
  type: string;
  message: MessageDto | null;
  occurredAt: string;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly db: DataSource,
    private readonly auth: AuthService,
    private readonly access: ChatAccessService,
    private readonly crypto: ChatCryptoService,
    private readonly receipts: ChatReceiptService,
    private readonly events: ChatEventService,
    private readonly cursors: ChatCursorService,
    private readonly rate: ChatRateService,
    private readonly users: UsersService,
    private readonly classes: ClassReadService,
    private readonly attachments: ChatAttachmentsService,
  ) {}
  async get(actor: AuthenticatedUser, id: string): Promise<ConversationDto> {
    return this.db.transaction(async (m) =>
      this.conversationDto(m, actor, await this.access.authorize(m, actor, id)),
    );
  }
  async classChat(actor: AuthenticatedUser, classId: string): Promise<ConversationDto> {
    this.access.enabled();
    return this.db.transaction(async (m) => {
      const scopes = await this.classes.chatScopes(m, [classId]);
      const scope = scopes[0];
      if (!scope) throw new ChatException(404, 'CHAT_NOT_FOUND');
      const virtual: ConversationRow = {
        id: '',
        type: 'CLASS',
        class_id: classId,
        user_low: null,
        user_high: null,
        last_event_seq: '0',
        created_at: new Date(),
        updated_at: new Date(),
      };
      if ((await this.access.sourceMode(m, actor, virtual)) === 'NONE')
        throw new ChatException(404, 'CHAT_NOT_FOUND');
      const rows: ConversationRow[] = await m.query(
        'SELECT * FROM chat_conversations WHERE class_id=$1',
        [classId],
      );
      if (!rows[0]) throw new ChatException(503, 'CHAT_PROVISIONING');
      return this.conversationDto(m, actor, await this.access.authorize(m, actor, rows[0].id));
    });
  }
  async list(actor: AuthenticatedUser, q: ConversationQuery): Promise<ChatPage<ConversationDto>> {
    this.access.enabled();
    const scope = `conversations/${q.type ?? 'ALL'}`;
    const cursor = q.cursor ? this.cursors.decode(q.cursor, actor.userId, scope) : null;
    return this.db.transaction(async (m) => {
      const data: ConversationDto[] = [];
      let position = cursor?.position ?? '',
        hasMore = false;
      // Apply source policy before projecting metadata, scanning activity/id keysets.
      for (;;) {
        const [time, lastId] = this.cursors.position(position);
        const rows: ConversationRow[] = await m.query(
          `SELECT c.* FROM chat_conversations c
          JOIN chat_members x ON x.conversation_id=c.id AND x.user_id=$1 AND x.left_at IS NULL
          WHERE ($2::timestamptz IS NULL OR (c.updated_at,c.id)<($2,$3::uuid)) AND ($4::text IS NULL OR c.type=$4)
          ORDER BY c.updated_at DESC,c.id DESC LIMIT 100`,
          [actor.userId, time, lastId, q.type === 'GROUP' ? 'CLASS' : (q.type ?? null)],
        );
        if (!rows.length) break;
        for (const c of rows) {
          try {
            const authorized = await this.access.authorize(m, actor, c.id);
            if (data.length === q.limit) {
              hasMore = true;
              break;
            }
            data.push(await this.conversationDto(m, actor, authorized));
          } catch (e) {
            if (!(e instanceof ChatException) || ![404, 503].includes(e.getStatus())) throw e;
          }
          position = `${c.updated_at.toISOString()}|${c.id}`;
        }
        if (hasMore || rows.length < 100) break;
      }
      return {
        data,
        meta: {
          hasMore,
          nextCursor: hasMore ? this.cursors.encode(actor.userId, scope, position, '') : null,
        },
      };
    });
  }
  async members(
    actor: AuthenticatedUser,
    id: string,
    q: ChatPageQuery,
  ): Promise<
    ChatPage<{
      userId: string;
      displayName: string;
      avatarUrl: null;
      role: 'ADMIN' | 'MEMBER';
      joinedAt: string;
      lastReadSequence: string;
    }>
  > {
    id = id.toLowerCase();
    const scope = `members/${id}`,
      cursor = q.cursor ? this.cursors.decode(q.cursor, actor.userId, scope) : null;
    return this.db.transaction(async (m) => {
      const a = await this.access.authorize(m, actor, id),
        allowed = await this.access.recipients(m, a.conversation);
      const [time, lastId] = this.cursors.position(cursor?.position ?? '');
      const rows: { user_id: string; joined_at: Date; last_read_seq: string }[] = await m.query(
        `SELECT * FROM chat_members
        WHERE conversation_id=$1 AND user_id=ANY($2::uuid[]) AND ($3::timestamptz IS NULL OR (joined_at,user_id)>($3,$4::uuid))
        ORDER BY joined_at,user_id LIMIT $5`,
        [id, allowed, time, lastId, q.limit + 1],
      );
      const selected = rows.slice(0, q.limit),
        users = await this.users.findByIds(
          selected.map((r) => r.user_id),
          m,
        );
      const hasMore = rows.length > q.limit;
      return {
        data: selected.map((r) => ({
          userId: r.user_id,
          displayName: users.find((u) => u.id === r.user_id)?.displayName ?? '',
          avatarUrl: null,
          role: users.find((u) => u.id === r.user_id)?.role === 'MENTOR' ? 'ADMIN' : 'MEMBER',
          joinedAt: r.joined_at.toISOString(),
          lastReadSequence: r.last_read_seq,
        })),
        meta: {
          hasMore,
          nextCursor: hasMore
            ? this.cursors.encode(
                actor.userId,
                scope,
                `${selected.at(-1)?.joined_at.toISOString()}|${selected.at(-1)?.user_id}`,
                '',
              )
            : null,
        },
      };
    });
  }
  async history(
    actor: AuthenticatedUser,
    id: string,
    q: ChatPageQuery,
  ): Promise<ChatPage<MessageDto>> {
    id = id.toLowerCase();
    const scope = `history/${id}`,
      cursor = q.cursor ? this.cursors.decode(q.cursor, actor.userId, scope) : null;
    return this.db.transaction(async (m) => {
      const a = await this.access.authorize(m, actor, id),
        watermark = cursor?.watermark ?? a.conversation.last_event_seq;
      const before = cursor?.position ?? (BigInt(watermark) + 1n).toString();
      const rows: MessageRow[] = await m.query(
        `SELECT * FROM chat_messages WHERE conversation_id=$1
        AND sequence>=$2 AND sequence<$3 AND sequence<=$4 ORDER BY sequence DESC LIMIT $5`,
        [id, a.member.visible_from_seq, before, watermark, q.limit + 1],
      );
      const selected = rows.slice(0, q.limit),
        hasMore = rows.length > q.limit;
      const data: MessageDto[] = [];
      for (const row of selected.reverse())
        data.push(await this.messageDto(m, actor, row, a.member.visible_from_seq));
      return {
        data,
        meta: {
          highWatermark: watermark,
          hasMore,
          nextCursor: hasMore
            ? this.cursors.encode(actor.userId, scope, selected[0]?.sequence ?? '0', watermark)
            : null,
        },
      };
    });
  }
  async send(
    actor: AuthenticatedUser,
    id: string,
    input: SendChatInput,
  ): Promise<{ message: MessageDto; replayed: boolean }> {
    id = id.toLowerCase();
    const replyId = input.replyToMessageId?.toLowerCase() ?? null,
      fileId = input.fileObjectId?.toLowerCase() ?? null;
    if (input.type === 'TEXT' || (input.body !== undefined && input.body !== null))
      this.validateText(input.body);
    if ((input.type === 'TEXT' && fileId) || (input.type !== 'TEXT' && !fileId))
      throw new ChatException(422, 'CHAT_INVALID_INPUT');
    this.rate.send(actor.userId);
    return this.db.transaction(async (m) => {
      await this.auth.assertAccessPrincipalValid(actor, m);
      const a = await this.access.authorize(m, actor, id, true, true),
        route = `send/${id}`;
      const request = ['send', id, input.type, input.body ?? null, replyId ?? null, fileId ?? null];
      const prior = await this.receipts.lookup(
        m,
        actor.userId,
        route,
        input.clientMessageId,
        request,
      );
      if (prior) return { message: await this.visibleMessage(m, actor, a, prior), replayed: true };
      if (input.type !== 'TEXT' && fileId)
        await this.attachments.assertReady(m, actor, id, fileId, input.type);
      if (replyId) {
        const reply = await this.row(m, id, replyId);
        if (
          !reply ||
          reply.deleted_at ||
          BigInt(reply.sequence) < BigInt(a.member.visible_from_seq)
        )
          throw new ChatException(404, 'CHAT_NOT_FOUND');
      }
      const messageId = randomUUID(),
        sequence = await this.events.nextSequence(m, id);
      await this.crypto.reserveEncryption(m);
      const encrypted = this.crypto.encrypt(
        { messageId, conversationId: id, senderId: actor.userId },
        input.body ?? '',
      );
      await m.query(
        `INSERT INTO chat_messages(id,conversation_id,sender_id,client_message_id,
        sequence,last_changed_seq,reply_to_id,ciphertext,iv,tag,key_version,crypto_version,type,file_object_id,body_is_null)
        VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,1,$11,$12,$13)`,
        [
          messageId,
          id,
          actor.userId,
          input.clientMessageId,
          sequence,
          replyId ?? null,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.tag,
          encrypted.keyVersion,
          input.type,
          fileId ?? null,
          input.body === null || input.body === undefined,
        ],
      );
      await this.receipts.insert(m, actor.userId, route, input.clientMessageId, request, messageId);
      await this.events.append(m, {
        conversationId: id,
        sequence,
        type: 'message:created',
        messageId,
        actorId: actor.userId,
        recipientIds: await this.access.recipients(m, a.conversation),
      });
      return { message: await this.visibleMessage(m, actor, a, messageId), replayed: false };
    });
  }
  async mutate(
    actor: AuthenticatedUser,
    id: string,
    messageId: string,
    key: string,
    expectedVersion: number,
    input: EditChatInput | null,
  ): Promise<{ message: MessageDto; replayed: boolean }> {
    id = id.toLowerCase();
    messageId = messageId.toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key ?? ''))
      throw new ChatException(422, 'CHAT_INVALID_INPUT');
    if (input && input.body !== null) this.validateText(input.body);
    return this.db.transaction(async (m) => {
      await this.auth.assertAccessPrincipalValid(actor, m);
      const a = await this.access.authorize(m, actor, id, true, true),
        operation = input ? 'edit' : 'delete',
        route = `${operation}/${id}/${messageId}`;
      const request = [operation, id, messageId, expectedVersion, input?.body ?? null];
      const prior = await this.receipts.lookup(m, actor.userId, route, key, request);
      if (prior) return { message: await this.visibleMessage(m, actor, a, prior), replayed: true };
      const row = await this.row(m, id, messageId);
      if (
        !row ||
        row.sender_id !== actor.userId ||
        BigInt(row.sequence) < BigInt(a.member.visible_from_seq)
      )
        throw new ChatException(404, 'CHAT_NOT_FOUND');
      if (row.version !== expectedVersion) throw new ChatException(409, 'CHAT_VERSION_CONFLICT');
      if (input && row.type === 'TEXT' && input.body === null)
        throw new ChatException(422, 'CHAT_INVALID_INPUT');
      if (input && row.deleted_at) throw new ChatException(409, 'CHAT_MESSAGE_DELETED');
      if (input && Date.now() - row.created_at.getTime() > 900000)
        throw new ChatException(409, 'CHAT_EDIT_WINDOW_CLOSED');
      if (!row.deleted_at) {
        const sequence = await this.events.nextSequence(m, id);
        if (input) await this.crypto.reserveEncryption(m);
        const encrypted = input
          ? this.crypto.encrypt(
              { messageId, conversationId: id, senderId: actor.userId },
              input.body ?? '',
            )
          : null;
        await m.query(
          `UPDATE chat_messages SET version=version+1,last_changed_seq=$3,updated_at=clock_timestamp(),
          deleted_at=CASE WHEN $4::boolean THEN clock_timestamp() ELSE NULL END,
          ciphertext=$5,iv=$6,tag=$7,key_version=$8,crypto_version=$9,
          body_is_null=CASE WHEN $4::boolean THEN body_is_null ELSE $10 END WHERE id=$1 AND conversation_id=$2`,
          [
            messageId,
            id,
            sequence,
            !input,
            encrypted?.ciphertext ?? null,
            encrypted?.iv ?? null,
            encrypted?.tag ?? null,
            encrypted?.keyVersion ?? null,
            encrypted?.cryptoVersion ?? null,
            input?.body === null,
          ],
        );
        await this.events.append(m, {
          conversationId: id,
          sequence,
          type: input ? 'message:updated' : 'message:deleted',
          messageId,
          actorId: actor.userId,
          recipientIds: await this.access.recipients(m, a.conversation),
        });
      }
      await this.receipts.insert(m, actor.userId, route, key, request, messageId);
      return { message: await this.visibleMessage(m, actor, a, messageId), replayed: false };
    });
  }
  async read(
    actor: AuthenticatedUser,
    id: string,
    through: string,
  ): Promise<{
    conversationId: string;
    lastReadSequence: string;
    lastReadAt: string | null;
    unreadCount: number;
  }> {
    return this.db.transaction(async (m) => {
      const a = await this.access.authorize(m, actor, id, false, true),
        seq = this.sequence(through);
      if (
        seq > BigInt(a.conversation.last_event_seq) ||
        seq < BigInt(a.member.visible_from_seq) - 1n
      )
        throw new ChatException(422, 'CHAT_INVALID_INPUT');
      if (
        seq > 0n &&
        !(
          await m.query('SELECT 1 FROM chat_events WHERE conversation_id=$1 AND sequence=$2', [
            id,
            through,
          ])
        ).length
      )
        throw new ChatException(422, 'CHAT_INVALID_INPUT');
      await m.query(
        `UPDATE chat_members SET last_read_at=CASE WHEN last_read_seq<$3 THEN clock_timestamp() ELSE last_read_at END,
        last_read_seq=GREATEST(last_read_seq,$3) WHERE conversation_id=$1 AND user_id=$2`,
        [id, actor.userId, through],
      );
      await m.query(
        `UPDATE notifications n SET read_at=COALESCE(n.read_at,clock_timestamp()) FROM chat_messages x
        WHERE n.user_id=$1 AND n.conversation_id=$2 AND n.message_id=x.id AND x.sequence<=$3`,
        [actor.userId, id, through],
      );
      const rows: { last_read_seq: string; last_read_at: Date | null }[] = await m.query(
        'SELECT * FROM chat_members WHERE conversation_id=$1 AND user_id=$2',
        [id, actor.userId],
      );
      const row = rows[0];
      if (!row) throw new ChatException(404, 'CHAT_NOT_FOUND');
      return {
        conversationId: id,
        lastReadSequence: row.last_read_seq,
        lastReadAt: row.last_read_at?.toISOString() ?? null,
        unreadCount: await this.unread(m, actor, id, a.member.visible_from_seq, row.last_read_seq),
      };
    });
  }
  async catchup(
    actor: AuthenticatedUser,
    id: string,
    q: ChatEventQuery,
  ): Promise<ChatPage<ChatEventDto>> {
    id = id.toLowerCase();
    const scope = `events/${id}`,
      cursor = q.cursor ? this.cursors.decode(q.cursor, actor.userId, scope) : null;
    if (
      (cursor && (q.afterSequence !== undefined || q.throughSequence !== undefined)) ||
      (!cursor && q.afterSequence === undefined)
    )
      throw new ChatException(422, 'CHAT_CURSOR_INVALID');
    return this.db.transaction(async (m) => {
      const a = await this.access.authorize(m, actor, id),
        after = cursor?.position ?? q.afterSequence ?? '0';
      const through = cursor?.watermark ?? q.throughSequence ?? a.conversation.last_event_seq;
      if (this.sequence(after) < BigInt(a.conversation.events_pruned_through_seq ?? '0'))
        throw new ChatException(410, 'CHAT_RESYNC_REQUIRED');
      if (
        this.sequence(after) > this.sequence(through) ||
        this.sequence(through) > BigInt(a.conversation.last_event_seq)
      )
        throw new ChatException(422, 'CHAT_INVALID_INPUT');
      const expired: { expired: boolean }[] = await m.query(
        `SELECT EXISTS(SELECT 1 FROM chat_events
        WHERE conversation_id=$1 AND sequence>$2 AND sequence<=$3 AND created_at<clock_timestamp()-interval '90 days') AS expired`,
        [id, after, through],
      );
      if (expired[0]?.expired) throw new ChatException(410, 'CHAT_RESYNC_REQUIRED');
      const rows: {
        id: string;
        sequence: string;
        type: string;
        message_id: string | null;
        created_at: Date;
      }[] = await m.query(
        `SELECT e.* FROM chat_events e
        LEFT JOIN chat_messages x ON x.id=e.message_id WHERE e.conversation_id=$1 AND e.sequence>$2 AND e.sequence<=$3
        AND ((e.message_id IS NULL AND e.sequence>=$4) OR x.sequence>=$4) ORDER BY e.sequence LIMIT $5`,
        [id, after, through, a.member.visible_from_seq, q.limit + 1],
      );
      const data: ChatEventDto[] = [];
      for (const r of rows.slice(0, q.limit))
        data.push({
          eventId: r.id,
          conversationId: id,
          sequence: r.sequence,
          type: r.type,
          message: r.message_id ? await this.visibleMessage(m, actor, a, r.message_id) : null,
          occurredAt: r.created_at.toISOString(),
        });
      const hasMore = rows.length > q.limit;
      return {
        data,
        meta: {
          hasMore,
          throughSequence: through,
          nextCursor: hasMore
            ? this.cursors.encode(actor.userId, scope, data.at(-1)?.sequence ?? after, through)
            : null,
        },
      };
    });
  }
  async event(
    actor: AuthenticatedUser,
    conversationId: string,
    eventId: string,
  ): Promise<ChatEventDto | null> {
    return this.db.transaction(async (m) => {
      const a = await this.access.authorize(m, actor, conversationId);
      const rows: {
        id: string;
        sequence: string;
        type: string;
        message_id: string | null;
        created_at: Date;
      }[] = await m.query('SELECT * FROM chat_events WHERE id=$1 AND conversation_id=$2', [
        eventId,
        conversationId,
      ]);
      const row = rows[0];
      if (!row) return null;
      const message = row.message_id
        ? await this.visibleMessage(m, actor, a, row.message_id)
        : null;
      return {
        eventId: row.id,
        conversationId,
        sequence: row.sequence,
        type: row.type,
        message,
        occurredAt: row.created_at.toISOString(),
      };
    });
  }
  private sequence(value: string): bigint {
    if (!/^(0|[1-9]\d{0,18})$/.test(value) || BigInt(value) > 9223372036854775807n)
      throw new ChatException(422, 'CHAT_INVALID_INPUT');
    return BigInt(value);
  }
  private validateText(body: unknown): void {
    if (
      typeof body !== 'string' ||
      !body.trim() ||
      [...body].length > 4000 ||
      Buffer.byteLength(body, 'utf8') > 16384
    )
      throw new ChatException(422, 'CHAT_INVALID_INPUT');
  }
  private async row(m: EntityManager, id: string, messageId: string): Promise<MessageRow | null> {
    const rows: MessageRow[] = await m.query(
      'SELECT * FROM chat_messages WHERE conversation_id=$1 AND id=$2',
      [id, messageId],
    );
    return rows[0] ?? null;
  }
  private async visibleMessage(
    m: EntityManager,
    actor: AuthenticatedUser,
    a: AuthorizedChat,
    id: string,
  ): Promise<MessageDto> {
    const row = await this.row(m, a.conversation.id, id);
    if (!row || BigInt(row.sequence) < BigInt(a.member.visible_from_seq))
      throw new ChatException(404, 'CHAT_NOT_FOUND');
    return this.messageDto(m, actor, row, a.member.visible_from_seq);
  }
  private async messageDto(
    m: EntityManager,
    actor: AuthenticatedUser,
    row: MessageRow,
    visibleFrom = '1',
  ): Promise<MessageDto> {
    let body: string | null = null;
    if (!row.deleted_at) {
      if (!row.ciphertext || !row.iv || !row.tag || !row.key_version || !row.crypto_version)
        throw new ChatException(503, 'CHAT_CRYPTO_UNAVAILABLE');
      try {
        body = this.crypto.decrypt(
          { messageId: row.id, conversationId: row.conversation_id, senderId: row.sender_id },
          {
            ciphertext: row.ciphertext,
            iv: row.iv,
            tag: row.tag,
            keyVersion: row.key_version,
            cryptoVersion: row.crypto_version,
          },
        );
        if (row.body_is_null) body = null;
      } catch {
        throw new ChatException(503, 'CHAT_CRYPTO_UNAVAILABLE');
      }
    }
    const sender = (await this.users.findByIds([row.sender_id], m))[0];
    let replyTo: MessageDto['replyTo'] = null;
    if (row.reply_to_id && !row.deleted_at) {
      const reply = await this.row(m, row.conversation_id, row.reply_to_id);
      if (reply && BigInt(reply.sequence) >= BigInt(visibleFrom))
        replyTo = {
          id: reply.id,
          senderDisplayName:
            (await this.users.findByIds([reply.sender_id], m))[0]?.displayName ?? '',
          deleted: !!reply.deleted_at,
        };
    }
    return {
      id: row.id,
      conversationId: row.conversation_id,
      sender: { id: row.sender_id, displayName: sender?.displayName ?? '', avatarUrl: null },
      clientMessageId: row.sender_id === actor.userId ? row.client_message_id : null,
      sequence: row.sequence,
      lastChangedSequence: row.last_changed_seq,
      type: row.type,
      body,
      file:
        !row.deleted_at && row.file_object_id
          ? await this.attachments.summaryFor(m, row.conversation_id, row.file_object_id)
          : null,
      replyTo,
      version: row.version,
      createdAt: row.created_at.toISOString(),
      editedAt: row.version > 1 && !row.deleted_at ? row.updated_at.toISOString() : null,
      deletedAt: row.deleted_at?.toISOString() ?? null,
    };
  }
  private async unread(
    m: EntityManager,
    actor: AuthenticatedUser,
    id: string,
    visible: string,
    read: string,
  ): Promise<number> {
    const rows: { count: string }[] = await m.query(
      `SELECT count(*)::text AS count FROM chat_messages
      WHERE conversation_id=$1 AND sequence>=$2 AND sequence>$3 AND sender_id<>$4 AND deleted_at IS NULL`,
      [id, visible, read, actor.userId],
    );
    return Number(rows[0]?.count ?? 0);
  }
  private async conversationDto(
    m: EntityManager,
    actor: AuthenticatedUser,
    a: AuthorizedChat,
  ): Promise<ConversationDto> {
    const c = a.conversation,
      peerId =
        c.type === 'DIRECT' ? (c.user_low === actor.userId ? c.user_high : c.user_low) : null;
    const peer = peerId ? (await this.users.findByIds([peerId], m))[0] : null;
    const scope = c.class_id ? (await this.classes.chatScopes(m, [c.class_id]))[0] : null;
    const rows: MessageRow[] = await m.query(
      'SELECT * FROM chat_messages WHERE conversation_id=$1 AND sequence>=$2 ORDER BY sequence DESC LIMIT 1',
      [c.id, a.member.visible_from_seq],
    );
    const pending = c.class_id
      ? (await this.access.relations(m, [c.class_id])).some(
          (r) => r.studentId === actor.userId && r.enrollmentStatus === 'PENDING_PAYMENT',
        )
      : false;
    return {
      id: c.id,
      type: c.type === 'CLASS' ? 'GROUP' : 'DIRECT',
      classId: c.class_id,
      name: scope?.name ?? null,
      peer: peer ? { id: peer.id, displayName: peer.displayName, avatarUrl: null } : null,
      capabilities: {
        canRead: true,
        canSend: a.mode === 'WRITE',
        canAttach: a.mode === 'WRITE' && this.attachments.available(),
        canType: a.mode === 'WRITE',
      },
      accessMode: a.mode === 'READ' ? 'HISTORY_READ_ONLY' : pending ? 'CASH_PENDING' : 'ACTIVE',
      lastReadSequence: a.member.last_read_seq,
      highWatermark: c.last_event_seq,
      unreadCount: await this.unread(
        m,
        actor,
        c.id,
        a.member.visible_from_seq,
        a.member.last_read_seq,
      ),
      lastMessage: rows[0]
        ? await this.messageDto(m, actor, rows[0], a.member.visible_from_seq)
        : null,
      activityAt: c.updated_at.toISOString(),
    };
  }
}
