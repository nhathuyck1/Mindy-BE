import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { ChatException } from '../../chat/exceptions/chat.exceptions.js';
// biome-ignore lint/style/useImportType: Exported domain policy provider.
import { type AuthorizedChat, ChatAccessService } from '../../chat/services/chat-access.service.js';
// biome-ignore lint/style/useImportType: Exported domain read provider.
import { MaterialAuthoringService } from '../../materials/services/material-authoring.service.js';
// biome-ignore lint/style/useImportType: Exported domain read provider.
import { StudentMaterialsService } from '../../materials/services/student-materials.service.js';
import { NOTIFICATION_ACCESS_QUERY } from '../domain/notification-access.query.js';
import type { NotificationRow } from '../dtos/notification.dto.js';

export interface NotificationVisibility {
  visible: boolean;
  available: boolean;
  contextId?: string;
}

/** Persistence projections are shared with capture; materials/chat call their owning policies. */
@Injectable()
export class NotificationPolicyService {
  constructor(
    private readonly config: ConfigService,
    private readonly chat: ChatAccessService,
    private readonly materials: StudentMaterialsService,
    private readonly authors: MaterialAuthoringService,
  ) {}

  async check(
    m: EntityManager,
    actor: AuthenticatedUser,
    r: NotificationRow,
  ): Promise<NotificationVisibility> {
    return (await this.checkBatch(m, actor, [r])).get(r.id) ?? { visible: false, available: false };
  }

  async checkBatch(
    m: EntityManager,
    actor: AuthenticatedUser,
    rows: NotificationRow[],
  ): Promise<Map<string, NotificationVisibility>> {
    const result = new Map<string, NotificationVisibility>();
    if (!rows.length) return result;
    const users: { allowed: boolean }[] = await m.query(
      `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND status='ACTIVE' AND role::text=$2) AS allowed`,
      [actor.userId, actor.role],
    );
    const eligible = rows.filter(
      (r) =>
        users[0]?.allowed &&
        r.user_id === actor.userId &&
        (!r.recipient_role || r.recipient_role === actor.role),
    );
    const simple = eligible.filter(
      (r) => r.type !== 'CHAT_MESSAGE' && r.resource_kind !== 'MATERIAL',
    );
    const values: { id: string; available: boolean }[] = simple.length
      ? await m.query(NOTIFICATION_ACCESS_QUERY, [
          actor.userId,
          actor.role,
          JSON.stringify(
            simple.map((r) => ({
              id: r.id,
              resource_id: r.resource_id,
              resource_kind: r.resource_kind,
              type: r.type,
              revision: r.revision,
              relation_keys: r.relation_keys,
            })),
          ),
          this.config.get<boolean>('ASSIGNMENT_ZIP_ENABLED', false),
        ])
      : [];
    const availabilityById = new Map(values.map((v) => [v.id, v.available]));
    for (const row of simple) {
      const available = availabilityById.get(row.id) === true;
      result.set(row.id, {
        visible: available || row.terminal === true,
        available,
        ...(available &&
        row.context_id &&
        ['SESSION', 'SUBMISSION', 'MAKEUP'].includes(row.resource_kind ?? '')
          ? { contextId: row.context_id }
          : {}),
      });
    }
    await this.checkChatBatch(
      m,
      actor,
      eligible.filter((r) => r.type === 'CHAT_MESSAGE'),
      result,
    );
    const cached = new Map<string, { available: boolean; contextId?: string }>();
    for (const row of eligible.filter(
      (r) => r.type !== 'CHAT_MESSAGE' && r.resource_kind === 'MATERIAL',
    )) {
      const key = JSON.stringify([
        row.type,
        row.conversation_id,
        row.message_id,
        row.resource_id,
        row.context_id,
        row.context_ids,
        row.relation_keys,
      ]);
      let availability = cached.get(key);
      if (!availability) {
        availability = await this.available(m, actor, row);
        cached.set(key, availability);
      }
      result.set(row.id, {
        ...availability,
        visible: availability.available || row.terminal === true,
      });
    }
    return result;
  }

  private async checkChatBatch(
    m: EntityManager,
    actor: AuthenticatedUser,
    rows: NotificationRow[],
    result: Map<string, NotificationVisibility>,
  ): Promise<void> {
    if (!rows.length) return;
    const contexts = new Map<string, AuthorizedChat | null>();
    if (
      this.config.get<boolean>('CHAT_ENABLED', false) &&
      ['MENTOR', 'STUDENT'].includes(actor.role)
    ) {
      for (const row of rows) {
        if (!row.conversation_id || !row.message_id || contexts.has(row.conversation_id)) continue;
        try {
          contexts.set(
            row.conversation_id,
            await this.chat.authorize(m, actor, row.conversation_id),
          );
        } catch (error) {
          if (!(error instanceof ChatException) || ![403, 404].includes(error.getStatus()))
            throw error;
          contexts.set(row.conversation_id, null);
        }
      }
    }
    const candidates = rows.filter((r) => r.message_id && contexts.get(r.conversation_id ?? ''));
    const messages: { id: string; conversation_id: string; sequence: string }[] = candidates.length
      ? await m.query(
          'SELECT id,conversation_id,sequence FROM chat_messages WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL',
          [[...new Set(candidates.map((r) => r.message_id))]],
        )
      : [];
    const byId = new Map(messages.map((message) => [message.id, message]));
    for (const row of rows) {
      const context = contexts.get(row.conversation_id ?? ''),
        message = byId.get(row.message_id ?? ''),
        available = Boolean(
          context &&
            message &&
            message.conversation_id === row.conversation_id &&
            BigInt(message.sequence) >= BigInt(context.member.visible_from_seq),
        );
      result.set(row.id, { visible: available || row.terminal === true, available });
    }
  }

  private async available(
    m: EntityManager,
    actor: AuthenticatedUser,
    r: NotificationRow,
  ): Promise<{ available: boolean; contextId?: string }> {
    const id = r.resource_id;
    if (!id) return { available: false };
    if (r.resource_kind === 'MATERIAL') {
      if (r.type !== 'MATERIAL_PUBLISHED') {
        if (!r.context_id) return { available: false };
        try {
          await this.authors.detail(actor, id, { classId: r.context_id });
          return { available: true, contextId: r.context_id };
        } catch (error) {
          if (error instanceof AppHttpException && [403, 404].includes(error.getStatus()))
            return { available: false };
          throw error;
        }
      }
      for (const contextId of r.context_ids ?? []) {
        try {
          if (r.relation_keys?.length) {
            const matches: { allowed: boolean }[] = await m.query(
              `SELECT EXISTS(SELECT 1 FROM enrollments e WHERE e.class_id=$1 AND e.student_id=$2
              AND 'enrollment/'||e.id::text||'/'||e.notification_entitlement_revision::text=ANY($3::text[])) AS allowed`,
              [contextId, actor.userId, r.relation_keys],
            );
            if (!matches[0]?.allowed) continue;
          }
          await this.materials.detail(actor, contextId, id);
          return { available: true, contextId };
        } catch (error) {
          if (!(error instanceof AppHttpException) || ![403, 404].includes(error.getStatus()))
            throw error;
        }
      }
      return { available: false };
    }
    return { available: false };
  }
}
