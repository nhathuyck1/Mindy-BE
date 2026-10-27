import { UserRole } from '../../users/user-role.enum.js';
import type { ChatEntitlement, ChatMode, ChatPrincipal, ChatRelation } from '../chat.contracts.js';

/** CASH uses the actual order deadline; a stale seat hold never grants access. */
export function relationMode(relation: ChatRelation, now: Date): ChatMode {
  if (!['OPEN', 'IN_PROGRESS', 'COMPLETED'].includes(relation.classStatus)) return 'NONE';
  const status = relation.enrollmentStatus;
  const eligible =
    status === 'ACTIVE' ||
    status === 'COMPLETED' ||
    (status === 'PENDING_PAYMENT' &&
      relation.paymentType === 'CASH' &&
      relation.orderStatus === 'PENDING' &&
      relation.expiresAt !== null &&
      relation.expiresAt.getTime() > now.getTime());
  if (!eligible) return 'NONE';
  return status === 'COMPLETED' || relation.classStatus === 'COMPLETED' ? 'READ' : 'WRITE';
}

export function groupEntitlement(
  principal: ChatPrincipal,
  scope: { readonly id: string; readonly mentorId: string; readonly status: string },
  relations: readonly ChatRelation[],
  now: Date,
): ChatEntitlement {
  const result = (mode: ChatMode): ChatEntitlement => ({ mode, history: 'CURRENT_JOIN' });
  if (!principal.active || !['OPEN', 'IN_PROGRESS', 'COMPLETED'].includes(scope.status))
    return result('NONE');
  if (principal.role === UserRole.MENTOR && principal.userId === scope.mentorId)
    return result(scope.status === 'COMPLETED' ? 'READ' : 'WRITE');
  if (principal.role !== UserRole.STUDENT) return result('NONE');
  return result(
    bestMode(
      relations
        .filter((r) => r.classId === scope.id && r.studentId === principal.userId)
        .map((r) => relationMode(r, now)),
    ),
  );
}

export function directEntitlement(
  principal: ChatPrincipal,
  pair: readonly [string, string],
  relations: readonly ChatRelation[],
  now: Date,
): ChatEntitlement {
  if (
    !principal.active ||
    !pair.includes(principal.userId) ||
    ![UserRole.STUDENT, UserRole.MENTOR].includes(principal.role)
  )
    return { mode: 'NONE', history: 'PAIR' };
  const modes = relations
    .filter(
      (r) =>
        pair.includes(r.mentorId) &&
        pair.includes(r.studentId) &&
        r.mentorId !== r.studentId &&
        (principal.role === UserRole.MENTOR
          ? r.mentorId === principal.userId
          : r.studentId === principal.userId),
    )
    .map((r) => relationMode(r, now));
  return { mode: bestMode(modes), history: 'PAIR' };
}

function bestMode(modes: readonly ChatMode[]): ChatMode {
  return modes.includes('WRITE') ? 'WRITE' : modes.includes('READ') ? 'READ' : 'NONE';
}

export function canonicalPair(a: string, b: string): readonly [string, string] {
  const first = a.toLowerCase(),
    second = b.toLowerCase();
  if (first === second) throw new Error('Direct conversation requires two different users');
  return first < second ? [first, second] : [second, first];
}
