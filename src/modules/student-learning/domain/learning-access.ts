import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import { LearningAccessMode } from '../enums/learning-access-mode.enum.js';
import { LearningAccessReason } from '../enums/learning-access-reason.enum.js';

export interface LearningAccessInput {
  readonly enrollmentStatus: EnrollmentStatus;
  readonly classStatus: ClassStatus;
  /**
   * The student's own order reached through `enrollment.order_detail_id`; null when that chain
   * is missing or points to another student/class.
   */
  readonly order: {
    readonly status: OrderStatus;
    readonly paymentType: PaymentType;
    readonly expiresAt: Date;
  } | null;
}

export interface LearningAccess {
  readonly mode: LearningAccessMode;
  readonly reason: LearningAccessReason;
  /** A pending hold whose deadline passed, even if the expiry job has not persisted it yet. */
  readonly isHoldExpired: boolean;
  /** Belongs to the `current` view; otherwise the row is history. */
  readonly isCurrent: boolean;
}

/**
 * Read-time access rule shared by My Classes and the personal schedule. It mirrors the existing
 * detail (ACTIVE) and CASH preview (unexpired pending CASH hold) checks; those endpoints still
 * re-check access on every request. A cancelled class blocks every entitlement.
 */
export function evaluateLearningAccess(input: LearningAccessInput, now: Date): LearningAccess {
  const { enrollmentStatus, order } = input;
  if (order === null) {
    return {
      mode: LearningAccessMode.NONE,
      reason: LearningAccessReason.STATE_MISMATCH,
      isHoldExpired: false,
      isCurrent: false,
    };
  }

  const isPending = enrollmentStatus === EnrollmentStatus.PENDING_PAYMENT;
  const isHoldExpired = isPending && order.expiresAt.getTime() <= now.getTime();
  const isOpenHold = isPending && order.status === OrderStatus.PENDING && !isHoldExpired;
  const isCurrent =
    enrollmentStatus === EnrollmentStatus.ACTIVE ||
    enrollmentStatus === EnrollmentStatus.COMPLETED ||
    isOpenHold;
  const result = (mode: LearningAccessMode, reason: LearningAccessReason): LearningAccess => ({
    mode,
    reason,
    isHoldExpired,
    isCurrent,
  });
  const none = (reason: LearningAccessReason): LearningAccess =>
    result(LearningAccessMode.NONE, reason);

  // Settlement activates holds in the same commit that marks the order PAID.
  if (isPending && order.status === OrderStatus.PAID) {
    return none(LearningAccessReason.STATE_MISMATCH);
  }
  if (input.classStatus === ClassStatus.CANCELLED) {
    return none(LearningAccessReason.CLASS_CANCELLED);
  }
  switch (enrollmentStatus) {
    case EnrollmentStatus.CANCELLED:
      return none(LearningAccessReason.ENROLLMENT_CANCELLED);
    case EnrollmentStatus.COMPLETED:
      return none(LearningAccessReason.ENROLLMENT_COMPLETED);
    case EnrollmentStatus.ACTIVE:
      return result(LearningAccessMode.FULL, LearningAccessReason.ACTIVE_ENROLLMENT);
    case EnrollmentStatus.PENDING_PAYMENT:
      if (!isOpenHold) {
        return none(LearningAccessReason.HOLD_EXPIRED);
      }
      return order.paymentType === PaymentType.CASH
        ? result(LearningAccessMode.CASH_PREVIEW, LearningAccessReason.PENDING_CASH)
        : none(LearningAccessReason.PENDING_PAYOS);
  }
}
