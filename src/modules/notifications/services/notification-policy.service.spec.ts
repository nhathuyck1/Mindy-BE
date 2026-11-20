import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { ChatException } from '../../chat/exceptions/chat.exceptions.js';
import type { AuthorizedChat, ChatAccessService } from '../../chat/services/chat-access.service.js';
import type { MaterialAuthoringService } from '../../materials/services/material-authoring.service.js';
import type { StudentMaterialsService } from '../../materials/services/student-materials.service.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { NotificationRow } from '../dtos/notification.dto.js';
import { NotificationPolicyService } from './notification-policy.service.js';

const actor: AuthenticatedUser = {
  userId: randomUUID(),
  sessionId: randomUUID(),
  role: UserRole.STUDENT,
};
function notification(conversationId: string): NotificationRow {
  return {
    id: randomUUID(),
    user_id: actor.userId,
    type: 'CHAT_MESSAGE',
    actor_id: randomUUID(),
    conversation_id: conversationId,
    message_id: randomUUID(),
    read_at: null,
    created_at: new Date(),
    event_id: null,
    resource_kind: null,
    resource_id: null,
    context_id: null,
    context_ids: null,
    relation_keys: null,
    revision: null,
    recipient_role: null,
    terminal: null,
  };
}
function context(id: string): AuthorizedChat {
  return {
    conversation: {
      id,
      type: 'CLASS',
      class_id: randomUUID(),
      user_low: null,
      user_high: null,
      last_event_seq: '10',
      created_at: new Date(),
      updated_at: new Date(),
    },
    member: {
      user_id: actor.userId,
      visible_from_seq: '9007199254740993',
      last_read_seq: '0',
      joined_at: new Date(),
      left_at: null,
      entitlement_version: 1,
    },
    mode: 'WRITE',
  };
}
function fixture(enabled = true) {
  const query = vi.fn<EntityManager['query']>();
  const authorize = vi.fn<ChatAccessService['authorize']>();
  const policy = new NotificationPolicyService(
    new ConfigService({ CHAT_ENABLED: enabled }),
    { authorize } as unknown as ChatAccessService,
    {} as StudentMaterialsService,
    {} as MaterialAuthoringService,
  );
  return { query, authorize, policy, manager: { query } as unknown as EntityManager };
}

describe('Notification chat batch visibility', () => {
  it('checks one conversation once for 100 messages and reauthorizes on the next request', async () => {
    const f = fixture(),
      id = randomUUID(),
      rows = Array.from({ length: 100 }, () => notification(id));
    f.authorize.mockResolvedValue(context(id));
    f.query.mockImplementation(async (sql: string) =>
      sql.includes('FROM users')
        ? [{ allowed: true }]
        : rows.map((r) => ({
            id: r.message_id,
            conversation_id: id,
            sequence: '9007199254740994',
          })),
    );
    const result = await f.policy.checkBatch(f.manager, actor, rows);
    expect([...result.values()].every((v) => v.visible && v.available)).toBe(true);
    expect(f.authorize).toHaveBeenCalledTimes(1);
    expect(f.query).toHaveBeenCalledTimes(2);
    f.authorize.mockRejectedValue(new ChatException(404, 'CHAT_NOT_FOUND'));
    const revoked = await f.policy.checkBatch(f.manager, actor, rows);
    expect([...revoked.values()].every((v) => !v.visible)).toBe(true);
    expect(f.authorize).toHaveBeenCalledTimes(2);
    expect(f.query).toHaveBeenCalledTimes(3);
  });

  it('hides deleted, earlier and mismatched messages without losing bigint precision', async () => {
    const f = fixture(),
      id = randomUUID(),
      rows = Array.from({ length: 4 }, () => notification(id));
    f.authorize.mockResolvedValue(context(id));
    f.query.mockResolvedValueOnce([{ allowed: true }]).mockResolvedValueOnce([
      { id: rows[0]?.message_id, conversation_id: id, sequence: '9007199254740993' },
      { id: rows[1]?.message_id, conversation_id: id, sequence: '9007199254740992' },
      { id: rows[2]?.message_id, conversation_id: randomUUID(), sequence: '9007199254740994' },
    ]);
    const result = await f.policy.checkBatch(f.manager, actor, rows);
    expect(rows.map((r) => result.get(r.id)?.visible)).toEqual([true, false, false, false]);
    expect(f.query.mock.calls[1]?.[0]).toContain('deleted_at IS NULL');
  });

  it('checks each conversation and propagates policy failures', async () => {
    const f = fixture(),
      rows = [notification(randomUUID()), notification(randomUUID())];
    f.query.mockResolvedValue([{ allowed: true }]);
    f.authorize.mockImplementation(async (_m, _actor, id) => context(id));
    await f.policy.checkBatch(f.manager, actor, rows);
    expect(f.authorize).toHaveBeenCalledTimes(2);
    const failure = new ChatException(503, 'CHAT_PROVISIONING');
    f.authorize.mockRejectedValue(failure);
    await expect(f.policy.checkBatch(f.manager, actor, rows)).rejects.toBe(failure);
  });

  it.each(['disabled', 'inactive', 'foreign', 'role'])(
    'does not query messages for %s rows',
    async (reason) => {
      const f = fixture(reason !== 'disabled'),
        row = notification(randomUUID());
      if (reason === 'foreign') row.user_id = randomUUID();
      if (reason === 'role') row.recipient_role = 'MENTOR';
      f.query.mockResolvedValue([{ allowed: reason !== 'inactive' }]);
      const result = await f.policy.checkBatch(f.manager, actor, [row]);
      expect(result.get(row.id)?.visible ?? false).toBe(false);
      expect(f.authorize).not.toHaveBeenCalled();
      expect(f.query).toHaveBeenCalledTimes(1);
    },
  );
});
