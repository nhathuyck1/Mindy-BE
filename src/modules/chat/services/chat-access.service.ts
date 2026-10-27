import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ClassReadService } from '../../classes/services/class-read.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { OrdersService } from '../../commerce/services/orders.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { UsersService } from '../../users/users.service.js';
import type { ChatMode, ChatRelation } from '../chat.contracts.js';
import { directEntitlement, groupEntitlement } from '../domain/chat-access.js';
import { ChatException } from '../exceptions/chat.exceptions.js';

export interface ConversationRow {
  id: string;
  type: 'CLASS' | 'DIRECT';
  class_id: string | null;
  user_low: string | null;
  user_high: string | null;
  last_event_seq: string;
  events_pruned_through_seq?: string;
  created_at: Date;
  updated_at: Date;
}
export interface MemberRow {
  user_id: string;
  visible_from_seq: string;
  last_read_seq: string;
  joined_at: Date;
  left_at: Date | null;
  entitlement_version: number;
}
export interface AuthorizedChat {
  conversation: ConversationRow;
  member: MemberRow;
  mode: ChatMode;
}

@Injectable()
export class ChatAccessService {
  constructor(
    private readonly config: ConfigService,
    private readonly classes: ClassReadService,
    private readonly enrollments: EnrollmentsService,
    private readonly orders: OrdersService,
    private readonly users: UsersService,
  ) {}
  enabled(): void {
    if (!this.config.get<boolean>('CHAT_ENABLED', false))
      throw new ChatException(503, 'CHAT_DISABLED');
  }
  async relations(manager: EntityManager, classIds: readonly string[]): Promise<ChatRelation[]> {
    const scopes = await this.classes.chatScopes(manager, classIds);
    const enrollments = await this.enrollments.chatScopes(manager, classIds);
    const orders = await this.orders.chatScopes(
      manager,
      enrollments.map((e) => e.orderDetailId),
    );
    const byOrder = new Map(orders.map((o) => [o.orderDetailId, o]));
    const byClass = new Map(scopes.map((c) => [c.id, c]));
    return enrollments.flatMap((e) => {
      const c = byClass.get(e.classId),
        o = byOrder.get(e.orderDetailId);
      return c
        ? [
            {
              classId: c.id,
              mentorId: c.mentorId,
              classStatus: c.status,
              studentId: e.studentId,
              enrollmentStatus: e.enrollmentStatus,
              paymentType: o?.paymentType ?? null,
              orderStatus: o?.orderStatus ?? null,
              expiresAt: o?.expiresAt ?? null,
            },
          ]
        : [];
    });
  }
  async sourceMode(
    manager: EntityManager,
    principal: Pick<AuthenticatedUser, 'userId' | 'role'>,
    conversation: ConversationRow,
  ): Promise<ChatMode> {
    const active = await this.users.findActiveByRole(principal.userId, principal.role, manager);
    if (!active) return 'NONE';
    const actor = { ...principal, active: true };
    const nowRows: { now: Date }[] = await manager.query('SELECT clock_timestamp() AS now');
    const now = nowRows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    if (conversation.type === 'CLASS' && conversation.class_id) {
      const scopes = await this.classes.chatScopes(manager, [conversation.class_id]);
      const scope = scopes[0];
      return scope
        ? groupEntitlement(actor, scope, await this.relations(manager, [scope.id]), now).mode
        : 'NONE';
    }
    const low = conversation.user_low,
      high = conversation.user_high;
    if (!low || !high) return 'NONE';
    const peers = await this.users.findByIds([low, high], manager);
    const mentor = peers.find((u) => u.role === UserRole.MENTOR && u.status === 'ACTIVE');
    const student = peers.find((u) => u.role === UserRole.STUDENT && u.status === 'ACTIVE');
    if (!mentor || !student) return 'NONE';
    const ids = await this.enrollments.chatClassIds(manager, student.id);
    return directEntitlement(actor, [low, high], await this.relations(manager, ids), now).mode;
  }
  async authorize(
    manager: EntityManager,
    principal: AuthenticatedUser,
    id: string,
    write = false,
    lock = false,
  ): Promise<AuthorizedChat> {
    this.enabled();
    const rows: ConversationRow[] = await manager.query(
      'SELECT * FROM chat_conversations WHERE id=$1',
      [id],
    );
    let conversation = rows[0];
    if (!conversation) throw new ChatException(404, 'CHAT_NOT_FOUND');
    if (lock) {
      const ids = conversation.class_id
        ? [conversation.class_id]
        : [
            ...new Set([
              ...(await this.enrollments.chatClassIds(
                manager,
                conversation.user_low ?? principal.userId,
              )),
              ...(await this.enrollments.chatClassIds(
                manager,
                conversation.user_high ?? principal.userId,
              )),
            ]),
          ].sort();
      await this.classes.lockChatScopes(manager, ids);
      const enrollments = await this.enrollments.chatScopes(manager, ids);
      await this.orders.lockChatScopes(
        manager,
        enrollments.map((e) => e.orderDetailId),
      );
      await this.enrollments.lockChatScopes(manager, ids);
      const scopes = await this.classes.chatScopes(manager, ids);
      const userIds = [
        ...new Set([
          principal.userId,
          ...enrollments.map((e) => e.studentId),
          ...scopes.map((c) => c.mentorId),
        ]),
      ].sort();
      const users = await this.users.findByIds(userIds, manager);
      for (const user of users.sort((a, b) => a.id.localeCompare(b.id)))
        await this.users.findActiveByRole(user.id, user.role, manager, true);
      const locked: ConversationRow[] = await manager.query(
        'SELECT * FROM chat_conversations WHERE id=$1 FOR UPDATE',
        [id],
      );
      conversation = locked[0];
      if (!conversation) throw new ChatException(404, 'CHAT_NOT_FOUND');
    }
    const mode = await this.sourceMode(manager, principal, conversation);
    if (mode === 'NONE') throw new ChatException(404, 'CHAT_NOT_FOUND');
    const members: MemberRow[] = await manager.query(
      `SELECT * FROM chat_members
      WHERE conversation_id=$1 AND user_id=$2 AND left_at IS NULL`,
      [id, principal.userId],
    );
    const member = members[0];
    if (!member) throw new ChatException(503, 'CHAT_PROVISIONING');
    if (write && mode !== 'WRITE') throw new ChatException(403, 'CHAT_READ_ONLY');
    return { conversation, member, mode };
  }
  async recipients(manager: EntityManager, conversation: ConversationRow): Promise<string[]> {
    const rows: { user_id: string }[] = await manager.query(
      `SELECT user_id FROM chat_members
      WHERE conversation_id=$1 AND left_at IS NULL ORDER BY user_id`,
      [conversation.id],
    );
    const users = await this.users.findByIds(
      rows.map((r) => r.user_id),
      manager,
    );
    const result: string[] = [];
    for (const user of users) {
      if (
        (await this.sourceMode(manager, { userId: user.id, role: user.role }, conversation)) !==
        'NONE'
      )
        result.push(user.id);
    }
    return result;
  }
}
