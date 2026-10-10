import type { ClassStatus } from '../enums/class-status.enum.js';
import type { ClassUnitStatus } from '../enums/class-unit-status.enum.js';
import type { SessionStatus } from '../enums/session-status.enum.js';

/** Public, entity-free context for content authorization; contains no meeting URL. */
export interface ClassContentContext {
  readonly classId: string;
  readonly courseId: string;
  readonly mentorId: string;
  readonly classStatus: ClassStatus;
  readonly classUnitId: string;
  readonly courseUnitId: string;
  readonly unitStatus: ClassUnitStatus;
  readonly unlockAt: Date | null;
  readonly sessionId: string | null;
  readonly sessionStatus: SessionStatus | null;
}
