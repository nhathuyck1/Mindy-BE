import { describe, expect, it } from 'vitest';
import { UserRole } from '../../users/user-role.enum.js';
import type { ChatRelation } from '../chat.contracts.js';
import { canonicalPair, directEntitlement, groupEntitlement, relationMode } from './chat-access.js';

const now = new Date('2026-10-24T05:00:00Z');
const scope = { id: 'class', mentorId: 'mentor', status: 'OPEN' };
const student = { userId: 'student', role: UserRole.STUDENT, active: true };
const base: ChatRelation = {
  classId: 'class',
  mentorId: 'mentor',
  classStatus: 'OPEN',
  studentId: 'student',
  enrollmentStatus: 'ACTIVE',
  paymentType: 'CASH',
  orderStatus: 'PENDING',
  expiresAt: new Date(now.getTime() + 1),
};
describe('Phase 6 source entitlement policy', () => {
  it.each([
    [{}, 'WRITE'],
    [{ enrollmentStatus: 'PENDING_PAYMENT' }, 'WRITE'],
    [{ enrollmentStatus: 'PENDING_PAYMENT', expiresAt: now }, 'NONE'],
    [{ enrollmentStatus: 'PENDING_PAYMENT', expiresAt: new Date(now.getTime() - 1) }, 'NONE'],
    [{ enrollmentStatus: 'PENDING_PAYMENT', paymentType: 'PAYOS' }, 'NONE'],
    [{ enrollmentStatus: 'PENDING_PAYMENT', orderStatus: 'EXPIRED' }, 'NONE'],
    [{ enrollmentStatus: 'PENDING_PAYMENT', orderStatus: 'CANCELLED' }, 'NONE'],
    [{ enrollmentStatus: 'COMPLETED' }, 'READ'],
    [{ classStatus: 'COMPLETED' }, 'READ'],
    [{ classStatus: 'CANCELLED' }, 'NONE'],
    [{ classStatus: 'DRAFT' }, 'NONE'],
    [{ enrollmentStatus: 'CANCELLED' }, 'NONE'],
  ] as const)('evaluates source changes %j -> %s', (changes, expected) => {
    expect(relationMode({ ...base, ...changes }, now)).toBe(expected);
  });
  it('grants only current primary mentor and active enrolled student', () => {
    expect(groupEntitlement(student, scope, [base], now).mode).toBe('WRITE');
    for (const role of [UserRole.ADMIN, UserRole.MANAGER, UserRole.MENTOR])
      expect(groupEntitlement({ ...student, role }, scope, [base], now).mode).toBe('NONE');
    expect(groupEntitlement({ ...student, active: false }, scope, [base], now).mode).toBe('NONE');
    expect(
      groupEntitlement({ userId: 'mentor', role: UserRole.MENTOR, active: true }, scope, [], now)
        .mode,
    ).toBe('WRITE');
    for (const userId of ['old-mentor', 'substitute', 'guest'])
      expect(
        groupEntitlement({ userId, role: UserRole.MENTOR, active: true }, scope, [], now).mode,
      ).toBe('NONE');
  });
  it('aggregates DM relations while group access remains bound to its class', () => {
    const cancelled = { ...base, classStatus: 'CANCELLED' };
    const other = { ...base, classId: 'other' };
    expect(directEntitlement(student, ['mentor', 'student'], [cancelled, other], now)).toEqual({
      mode: 'WRITE',
      history: 'PAIR',
    });
    expect(
      groupEntitlement(student, { ...scope, status: 'CANCELLED' }, [cancelled, other], now).mode,
    ).toBe('NONE');
    expect(
      directEntitlement(
        student,
        ['mentor', 'student'],
        [{ ...base, enrollmentStatus: 'COMPLETED' }],
        now,
      ).mode,
    ).toBe('READ');
    expect(directEntitlement(student, ['mentor', 'student'], [cancelled], now).mode).toBe('NONE');
    expect(directEntitlement(student, ['other', 'mentor'], [base], now).mode).toBe('NONE');
  });
  it('canonicalizes the unordered DM pair and rejects self-DM', () => {
    expect(canonicalPair('B', 'a')).toEqual(['a', 'b']);
    expect(() => canonicalPair('A', 'a')).toThrow();
  });
});
