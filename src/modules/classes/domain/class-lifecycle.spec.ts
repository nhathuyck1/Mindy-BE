import { describe, expect, it } from 'vitest';

import { ClassStatus } from '../enums/class-status.enum.js';
import { ClassInvalidTransitionException } from '../exceptions/class.exceptions.js';
import {
  assertClassTransition,
  canTransitionClass,
  isClassOpenForPurchase,
} from './class-lifecycle.js';

describe('class lifecycle', () => {
  it('allows the forward path DRAFT -> OPEN -> IN_PROGRESS -> COMPLETED', () => {
    expect(canTransitionClass(ClassStatus.DRAFT, ClassStatus.OPEN)).toBe(true);
    expect(canTransitionClass(ClassStatus.OPEN, ClassStatus.IN_PROGRESS)).toBe(true);
    expect(canTransitionClass(ClassStatus.IN_PROGRESS, ClassStatus.COMPLETED)).toBe(true);
  });

  it('allows cancelling any class that is not final', () => {
    for (const status of [ClassStatus.DRAFT, ClassStatus.OPEN, ClassStatus.IN_PROGRESS]) {
      expect(canTransitionClass(status, ClassStatus.CANCELLED)).toBe(true);
    }
  });

  it('rejects skipping states, reopening and leaving a final state', () => {
    expect(canTransitionClass(ClassStatus.DRAFT, ClassStatus.IN_PROGRESS)).toBe(false);
    expect(canTransitionClass(ClassStatus.IN_PROGRESS, ClassStatus.OPEN)).toBe(false);
    expect(canTransitionClass(ClassStatus.COMPLETED, ClassStatus.CANCELLED)).toBe(false);
    expect(canTransitionClass(ClassStatus.CANCELLED, ClassStatus.OPEN)).toBe(false);
    expect(() => assertClassTransition(ClassStatus.OPEN, ClassStatus.OPEN)).toThrow(
      ClassInvalidTransitionException,
    );
  });

  it('sells only OPEN classes that have not passed their end date', () => {
    const today = '2026-10-02';

    expect(isClassOpenForPurchase({ status: ClassStatus.OPEN, endDate: '2026-10-02' }, today)).toBe(
      true,
    );
    expect(isClassOpenForPurchase({ status: ClassStatus.OPEN, endDate: '2026-10-01' }, today)).toBe(
      false,
    );
    expect(
      isClassOpenForPurchase({ status: ClassStatus.IN_PROGRESS, endDate: '2026-12-01' }, today),
    ).toBe(false);
    expect(
      isClassOpenForPurchase({ status: ClassStatus.DRAFT, endDate: '2026-12-01' }, today),
    ).toBe(false);
  });
});
