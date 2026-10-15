import { describe, expect, it } from 'vitest';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { AttendanceAdmissionBasis as Basis } from '../enums/attendance-admission-basis.enum.js';
import { hasRecoveryEvidence } from './recovery-evidence.js';

describe('historical attendance payment policy', () => {
  const start = new Date('2026-10-13T12:00:00Z'),
    now = new Date('2026-10-13T15:00:00Z');
  const e = {
    classId: 'class',
    studentId: 'student',
    createdAt: new Date('2026-10-12T12:00:00Z'),
    status: 'ACTIVE',
  };
  const p = {
    classId: 'class',
    studentId: 'student',
    orderId: 'order',
    orderDetailId: 'detail',
    paymentId: 'payment',
    paidAt: start,
    paymentType: PaymentType.PAYOS,
  };
  it.each(['ACTIVE', 'COMPLETED', 'CANCELLED'])(
    'accepts paid historical %s enrollment with explicit basis',
    (status) => {
      expect(
        hasRecoveryEvidence({ ...e, status }, p, 'class', start, now, Basis.PAID_BEFORE_START),
      ).toBe(true);
    },
  );
  it('requires a pre-start hold and cash-only basis for late admission', () => {
    const late = { ...p, paidAt: new Date(start.getTime() + 1) };
    expect(hasRecoveryEvidence(e, late, 'class', start, now, Basis.CASH_LATE_ADMISSION)).toBe(
      false,
    );
    expect(
      hasRecoveryEvidence(
        e,
        { ...late, paymentType: PaymentType.CASH },
        'class',
        start,
        now,
        Basis.CASH_LATE_ADMISSION,
      ),
    ).toBe(true);
    expect(
      hasRecoveryEvidence(
        { ...e, createdAt: late.paidAt },
        { ...late, paymentType: PaymentType.CASH },
        'class',
        start,
        now,
        Basis.CASH_LATE_ADMISSION,
      ),
    ).toBe(false);
    expect(hasRecoveryEvidence(e, late, 'class', start, now, Basis.PAID_BEFORE_START)).toBe(false);
  });
  it('rejects unpaid/pending, mismatched lineage and future payment', () => {
    for (const enrollment of [
      { ...e, status: 'PENDING_PAYMENT' },
      { ...e, classId: 'other' },
      { ...e, studentId: 'other' },
    ])
      expect(hasRecoveryEvidence(enrollment, p, 'class', start, now, Basis.PAID_BEFORE_START)).toBe(
        false,
      );
    expect(hasRecoveryEvidence(e, undefined, 'class', start, now, Basis.PAID_BEFORE_START)).toBe(
      false,
    );
    expect(
      hasRecoveryEvidence(
        e,
        { ...p, paidAt: new Date(now.getTime() + 1), paymentType: PaymentType.CASH },
        'class',
        start,
        now,
        Basis.CASH_LATE_ADMISSION,
      ),
    ).toBe(false);
  });
});
