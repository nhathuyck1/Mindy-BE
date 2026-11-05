import { ClassOpeningService } from '../../src/modules/classes/services/class-opening.service.js';

/**
 * Legacy attendance/placement suites isolate their existing roster and race contracts
 * from the new paid-at-cutoff admission policy. They deliberately contain one-person
 * and pending-payment classes and move only the application clock into the future.
 * Real opening policy + lifecycle integration is covered by be-change-plan.spec.ts.
 * Session time, role, assignment, transaction and attendance guards remain real.
 */
export class LegacyAttendanceOpening extends ClassOpeningService {
  override async assertCanStart(): Promise<void> {}
}
