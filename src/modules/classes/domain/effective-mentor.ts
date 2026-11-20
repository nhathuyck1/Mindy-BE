import type { ClassSessionEntity } from '../entities/class-session.entity.js';
import { SessionStatus } from '../enums/session-status.enum.js';

export function effectiveMentorId(
  session: Pick<ClassSessionEntity, 'status' | 'mentorOverrideId' | 'teachingMentorId'>,
  primaryMentorId: string,
): string | null {
  return session.status === SessionStatus.SCHEDULED
    ? (session.mentorOverrideId ?? primaryMentorId)
    : session.teachingMentorId;
}

/** SQL equivalent; callers join the owning class as c and session as s. */
export const EFFECTIVE_MENTOR_SQL =
  "CASE WHEN s.status = 'SCHEDULED' THEN COALESCE(s.mentor_override_id, c.mentor_id) ELSE s.teaching_mentor_id END";

/** IN_PROGRESS support is activated by the lifecycle migration in slice 4.2. */
export const OCCUPIED_SESSION_SQL =
  "(s.status::text = 'IN_PROGRESS' OR (s.status::text = 'SCHEDULED' AND c.status::text IN ('OPEN', 'IN_PROGRESS')))";

/** Support calendar only: cancellation before start retains current allocation, never teaching credit. */
export const MANAGEMENT_MENTOR_SQL = `COALESCE(${EFFECTIVE_MENTOR_SQL}, CASE WHEN s.status = 'CANCELLED' THEN COALESCE(s.mentor_override_id, c.mentor_id) ELSE NULL END)`;
