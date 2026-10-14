import { describe, expect, it } from 'vitest';
import { SessionStatus } from '../enums/session-status.enum.js';
import { effectiveMentorId } from './effective-mentor.js';

describe('effective teaching assignment', () => {
  it('uses an override only before start and keeps historical teaching snapshots after primary changes', () => {
    expect(
      effectiveMentorId(
        { status: SessionStatus.SCHEDULED, mentorOverrideId: 'cover', teachingMentorId: null },
        'primary',
      ),
    ).toBe('cover');
    expect(
      effectiveMentorId(
        {
          status: SessionStatus.IN_PROGRESS,
          mentorOverrideId: 'cover',
          teachingMentorId: 'actual',
        },
        'new-primary',
      ),
    ).toBe('actual');
    expect(
      effectiveMentorId(
        { status: SessionStatus.COMPLETED, mentorOverrideId: null, teachingMentorId: null },
        'new-primary',
      ),
    ).toBeNull();
  });
});
