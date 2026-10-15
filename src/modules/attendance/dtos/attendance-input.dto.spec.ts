import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  MarkAttendanceDto,
  RecoverAttendanceDto,
  StartSessionDto,
} from './attendance-input.dto.js';

describe('Attendance request boundaries', () => {
  it('rejects duplicate roster IDs, invalid enums and empty/oversize batches', async () => {
    const row = { enrollmentId: '33333333-3333-4333-8333-333333333333', status: 'PRESENT' };
    for (const records of [[], [row, row], [{ ...row, status: 'LATE' }], Array(101).fill(row)])
      expect(
        await validate(plainToInstance(MarkAttendanceDto, { expectedVersion: 1, records })),
      ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(MarkAttendanceDto, { expectedVersion: 1, records: [row] })),
    ).toHaveLength(0);
  });
  it('requires a positive integer version and a zoned recovery timestamp; trims reason', async () => {
    for (const value of [
      { expectedVersion: 0 },
      { expectedVersion: 1.5 },
      { expectedVersion: 1, reason: null },
      { expectedVersion: 1, actualStartedAt: '2026-10-13T12:00:00' },
      { expectedVersion: 1, actualStartedAt: null },
    ])
      expect(await validate(plainToInstance(StartSessionDto, value))).not.toHaveLength(0);
    const valid = plainToInstance(StartSessionDto, {
      expectedVersion: 1,
      reason: '  Recovery  ',
      actualStartedAt: '2026-10-13T12:00:00Z',
    });
    expect(valid.reason).toBe('Recovery');
    expect(await validate(valid)).toHaveLength(0);
    const recovery = {
      expectedVersion: 1,
      reason: 'Verified register',
      evidenceNote: 'Classroom evidence',
      actualStartedAt: '2026-10-13T12:00:00Z',
      actualEndedAt: '2026-10-13T14:00:00Z',
      records: [
        {
          enrollmentId: '33333333-3333-4333-8333-333333333333',
          status: 'PRESENT',
          admissionBasis: 'PAID_BEFORE_START',
        },
      ],
    };
    expect(await validate(plainToInstance(RecoverAttendanceDto, recovery))).toHaveLength(0);
    for (const reason of [undefined, null, '', '   ']) {
      const errors = await validate(plainToInstance(RecoverAttendanceDto, { ...recovery, reason }));
      expect(errors.some((error) => error.property === 'reason')).toBe(true);
    }
  });
});
