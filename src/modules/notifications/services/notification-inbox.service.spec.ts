import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
import { NotificationQuery, type NotificationRow } from '../dtos/notification.dto.js';
import { NotificationCursorService } from './notification-cursor.service.js';
import { NotificationInboxService } from './notification-inbox.service.js';
import type { NotificationPolicyService } from './notification-policy.service.js';

describe('Notification inbox bounded pagination', () => {
  it('checks only limit + 1 candidates and continues past hidden rows', async () => {
    const actor: AuthenticatedUser = {
      userId: randomUUID(),
      sessionId: randomUUID(),
      role: UserRole.STUDENT,
    };
    const rows: NotificationRow[] = Array.from({ length: 42 }, (_, i) => ({
      id: randomUUID(),
      user_id: actor.userId,
      type: 'PAYMENT_CONFIRMED',
      actor_id: null,
      conversation_id: null,
      message_id: null,
      read_at: null,
      created_at: new Date(Date.now() - i * 1000),
      event_id: randomUUID(),
      resource_kind: 'ORDER',
      resource_id: randomUUID(),
      context_id: null,
      context_ids: [],
      relation_keys: [],
      revision: '1',
      recipient_role: 'STUDENT',
      terminal: false,
    }));
    const query = vi
      .fn<DataSource['query']>()
      .mockResolvedValueOnce(rows.slice(0, 21))
      .mockResolvedValueOnce(rows.slice(21));
    const checkBatch = vi.fn<NotificationPolicyService['checkBatch']>().mockImplementation(
      async (_m, _actor, batch) =>
        new Map(
          batch.map((r) => [
            r.id,
            {
              visible: r.id !== rows[0]?.id,
              available: true,
            },
          ]),
        ),
    );
    const config = new ConfigService({
      NOTIFICATIONS_ENABLED: true,
      NOTIFICATION_CURSOR_SECRET: 'test-only-secret-32-bytes-minimum-123456',
    });
    const cursors = new NotificationCursorService(config);
    const inbox = new NotificationInboxService(
      { query, manager: {} } as unknown as DataSource,
      config,
      cursors,
      { checkBatch } as unknown as NotificationPolicyService,
    );
    const page = await inbox.list(actor, new NotificationQuery());
    expect(page.data.map((r) => r.id)).toEqual(rows.slice(1, 21).map((r) => r.id));
    expect(page.meta.hasMore).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.map((call) => call[1]?.[5])).toEqual([21, 100]);
    expect(checkBatch.mock.calls.map((call) => call[2].length)).toEqual([21, 21]);
    const last = rows[20];
    expect(cursors.decode(page.meta.nextCursor ?? '', actor.userId, 'BUSINESS/false')).toBe(
      `${last?.created_at.toISOString()}|${last?.id}`,
    );
    expect(query.mock.calls[1]?.[1]?.[4]).toBe(last?.id);
  });
});
