import { describe, expect, it } from 'vitest';

import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import { LearningAccessMode } from '../enums/learning-access-mode.enum.js';
import { LearningAccessReason } from '../enums/learning-access-reason.enum.js';
import { evaluateLearningAccess, type LearningAccessInput } from './learning-access.js';

const NOW = new Date('2026-10-09T10:00:00.000Z');
const LATER = new Date(NOW.getTime() + 60_000);
const EARLIER = new Date(NOW.getTime() - 60_000);

function input(overrides: Partial<LearningAccessInput> = {}): LearningAccessInput {
  return {
    enrollmentStatus: EnrollmentStatus.ACTIVE,
    classStatus: ClassStatus.IN_PROGRESS,
    order: { status: OrderStatus.PAID, paymentType: PaymentType.PAYOS, expiresAt: EARLIER },
    ...overrides,
  };
}

function pending(
  paymentType: PaymentType,
  expiresAt: Date,
  status: OrderStatus = OrderStatus.PENDING,
): Partial<LearningAccessInput> {
  return {
    enrollmentStatus: EnrollmentStatus.PENDING_PAYMENT,
    order: { status, paymentType, expiresAt },
  };
}

describe('evaluateLearningAccess', () => {
  it('grants FULL to an ACTIVE enrollment in a running or finished class', () => {
    for (const classStatus of [ClassStatus.OPEN, ClassStatus.IN_PROGRESS, ClassStatus.COMPLETED]) {
      expect(evaluateLearningAccess(input({ classStatus }), NOW)).toEqual({
        mode: LearningAccessMode.FULL,
        reason: LearningAccessReason.ACTIVE_ENROLLMENT,
        isHoldExpired: false,
        isCurrent: true,
      });
    }
  });

  it('grants CASH_PREVIEW only to an unexpired CASH hold of a PENDING order', () => {
    expect(evaluateLearningAccess(input(pending(PaymentType.CASH, LATER)), NOW)).toEqual({
      mode: LearningAccessMode.CASH_PREVIEW,
      reason: LearningAccessReason.PENDING_CASH,
      isHoldExpired: false,
      isCurrent: true,
    });
  });

  it('keeps a pending PayOS hold current but without private access', () => {
    expect(evaluateLearningAccess(input(pending(PaymentType.PAYOS, LATER)), NOW)).toEqual({
      mode: LearningAccessMode.NONE,
      reason: LearningAccessReason.PENDING_PAYOS,
      isHoldExpired: false,
      isCurrent: true,
    });
  });

  it('treats a hold whose deadline equals now as expired before the expiry job runs', () => {
    for (const paymentType of [PaymentType.CASH, PaymentType.PAYOS]) {
      expect(evaluateLearningAccess(input(pending(paymentType, NOW)), NOW)).toEqual({
        mode: LearningAccessMode.NONE,
        reason: LearningAccessReason.HOLD_EXPIRED,
        isHoldExpired: true,
        isCurrent: false,
      });
    }
  });

  it('moves a pending hold of an EXPIRED or CANCELLED order to history', () => {
    for (const status of [OrderStatus.EXPIRED, OrderStatus.CANCELLED]) {
      expect(
        evaluateLearningAccess(input(pending(PaymentType.CASH, LATER, status)), NOW),
      ).toMatchObject({
        mode: LearningAccessMode.NONE,
        reason: LearningAccessReason.HOLD_EXPIRED,
        isHoldExpired: false,
        isCurrent: false,
      });
    }
  });

  it('fails closed when a pending hold belongs to a PAID order', () => {
    expect(
      evaluateLearningAccess(input(pending(PaymentType.CASH, LATER, OrderStatus.PAID)), NOW),
    ).toMatchObject({
      mode: LearningAccessMode.NONE,
      reason: LearningAccessReason.STATE_MISMATCH,
      isCurrent: false,
    });
  });

  it('fails closed when the own-order chain is missing', () => {
    expect(evaluateLearningAccess(input({ order: null }), NOW)).toEqual({
      mode: LearningAccessMode.NONE,
      reason: LearningAccessReason.STATE_MISMATCH,
      isHoldExpired: false,
      isCurrent: false,
    });
  });

  it('shows COMPLETED enrollments as current summaries without private access', () => {
    expect(
      evaluateLearningAccess(input({ enrollmentStatus: EnrollmentStatus.COMPLETED }), NOW),
    ).toEqual({
      mode: LearningAccessMode.NONE,
      reason: LearningAccessReason.ENROLLMENT_COMPLETED,
      isHoldExpired: false,
      isCurrent: true,
    });
  });

  it('keeps CANCELLED enrollments in history', () => {
    expect(
      evaluateLearningAccess(
        input({
          enrollmentStatus: EnrollmentStatus.CANCELLED,
          order: { status: OrderStatus.EXPIRED, paymentType: PaymentType.CASH, expiresAt: EARLIER },
        }),
        NOW,
      ),
    ).toEqual({
      mode: LearningAccessMode.NONE,
      reason: LearningAccessReason.ENROLLMENT_CANCELLED,
      isHoldExpired: false,
      isCurrent: false,
    });
  });

  it('lets a cancelled class block every entitlement while the row stays current', () => {
    expect(
      evaluateLearningAccess(input({ classStatus: ClassStatus.CANCELLED }), NOW),
    ).toMatchObject({
      mode: LearningAccessMode.NONE,
      reason: LearningAccessReason.CLASS_CANCELLED,
      isCurrent: true,
    });
    expect(
      evaluateLearningAccess(
        input({ ...pending(PaymentType.CASH, LATER), classStatus: ClassStatus.CANCELLED }),
        NOW,
      ),
    ).toMatchObject({
      mode: LearningAccessMode.NONE,
      reason: LearningAccessReason.CLASS_CANCELLED,
    });
  });
});
