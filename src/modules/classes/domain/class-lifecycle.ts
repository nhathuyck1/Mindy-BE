import { ClassStatus } from '../enums/class-status.enum.js';
import { ClassInvalidTransitionException } from '../exceptions/class.exceptions.js';

/**
 * DRAFT -> OPEN -> IN_PROGRESS -> COMPLETED, with CANCELLED reachable from any state that is
 * not final. COMPLETED and CANCELLED are terminal.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<ClassStatus, readonly ClassStatus[]>> = {
  [ClassStatus.DRAFT]: [ClassStatus.OPEN, ClassStatus.CANCELLED],
  [ClassStatus.OPEN]: [ClassStatus.IN_PROGRESS, ClassStatus.CANCELLED],
  [ClassStatus.IN_PROGRESS]: [ClassStatus.COMPLETED, ClassStatus.CANCELLED],
  [ClassStatus.COMPLETED]: [],
  [ClassStatus.CANCELLED]: [],
};

export function canTransitionClass(from: ClassStatus, to: ClassStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertClassTransition(from: ClassStatus, to: ClassStatus): void {
  if (!canTransitionClass(from, to)) {
    throw new ClassInvalidTransitionException(from, to);
  }
}

/** Only an OPEN class that has not passed its end date can be added to a cart or checked out. */
export function isClassOpenForPurchase(
  classEntity: { readonly status: ClassStatus; readonly endDate: string },
  today: string,
): boolean {
  return classEntity.status === ClassStatus.OPEN && classEntity.endDate >= today;
}
