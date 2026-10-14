import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AssignSessionMentorDto, MentorScheduleQueryDto } from './teaching-query.dto.js';

describe('teaching request validation', () => {
  it('permits explicit null override clearing but rejects missing IDs, whitespace reasons and stale-shaped versions', async () => {
    const valid = { mentorId: null, reason: ' Restore primary ', expectedVersion: 2 };
    const dto = plainToInstance(AssignSessionMentorDto, valid);
    expect(await validate(dto)).toEqual([]);
    expect(dto.reason).toBe('Restore primary');
    for (const input of [
      { reason: 'Cover', expectedVersion: 1 },
      { ...valid, reason: '   ' },
      { ...valid, mentorId: 'not-a-uuid' },
      { ...valid, expectedVersion: 0 },
      { ...valid, expectedVersion: '2' },
    ])
      expect(
        (await validate(plainToInstance(AssignSessionMentorDto, input))).length,
      ).toBeGreaterThan(0);
  });

  it('requires both range endpoints with explicit offsets, while permitting the default week', async () => {
    expect(await validate(new MentorScheduleQueryDto())).toEqual([]);
    for (const input of [
      { from: '2026-10-13T00:00:00Z' },
      { to: '2026-10-13T00:00:00Z' },
      { from: '2026-10-13T00:00:00', to: '2026-10-14T00:00:00Z' },
      { pageSize: 101 },
    ])
      expect(
        (await validate(plainToInstance(MentorScheduleQueryDto, input))).length,
      ).toBeGreaterThan(0);
  });
});
