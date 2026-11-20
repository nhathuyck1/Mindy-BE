import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/** Public predicate for discovery queries; no dependency on the Classes aggregate. */
export function approvedLeaveOverlap(mentor: string, starts: string, ends: string): string {
  return `EXISTS(SELECT 1 FROM mentor_approved_leave_intervals leave_interval
    WHERE leave_interval.mentor_id=${mentor} AND leave_interval.starts_at<${ends}
      AND leave_interval.ends_at>${starts})`;
}

@Injectable()
export class MentorAvailabilityService {
  async onLeave(
    m: EntityManager,
    mentorId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<boolean> {
    const rows: unknown[] = await m.query(
      `SELECT 1 WHERE ${approvedLeaveOverlap('$1', '$2', '$3')}`,
      [mentorId, startsAt, endsAt],
    );
    return rows.length > 0;
  }
}
