import type { AttendancePaymentEvidence } from '../../payments/services/attendance-payment-evidence.service.js';
import { AttendanceAdmissionBasis } from '../enums/attendance-admission-basis.enum.js';

/** Explicit roster evidence is supplied by Staff; these are the non-bypassable payment/cutoff gates. */
export function hasRecoveryEvidence(
  enrollment: { classId: string; studentId: string; createdAt: Date; status: string },
  payment: AttendancePaymentEvidence | undefined,
  classId: string,
  start: Date,
  now: Date,
  basis: AttendanceAdmissionBasis,
): boolean {
  if (
    !payment ||
    enrollment.classId !== classId ||
    payment.classId !== classId ||
    payment.studentId !== enrollment.studentId ||
    enrollment.createdAt > start ||
    !['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(enrollment.status) ||
    payment.paidAt > now
  )
    return false;
  if (basis === AttendanceAdmissionBasis.PAID_BEFORE_START) return payment.paidAt <= start;
  return (
    basis === AttendanceAdmissionBasis.CASH_LATE_ADMISSION &&
    payment.paymentType === 'CASH' &&
    payment.paidAt > start
  );
}
