import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { MarkAttendanceDto } from './attendance-input.dto.js';
import { CreateMakeupPlacementDto, MakeupListQueryDto, MakeupMutationDto } from './makeup.dto.js';

describe('Cross-class makeup request boundaries', () => {
  const uuid = '33333333-3333-4333-8333-333333333333';
  const body = {
    targetSessionId: uuid,
    expectedVersion: 1,
    expectedTargetVersion: 1,
    contentMatchConfirmed: true,
    reason: ' Equivalent content ',
  };
  it('requires affirmative content confirmation, UUID/version and a nonblank bounded reason', async () => {
    expect(await validate(plainToInstance(CreateMakeupPlacementDto, body))).toHaveLength(0);
    for (const invalid of [
      { contentMatchConfirmed: false },
      { contentMatchConfirmed: 'true' },
      { contentMatchConfirmed: null },
      { targetSessionId: 'bad' },
      { expectedVersion: '1' },
      { expectedTargetVersion: 0 },
      { reason: null },
      { reason: '   ' },
      { reason: 'a'.repeat(1001) },
    ])
      expect(
        await validate(plainToInstance(CreateMakeupPlacementDto, { ...body, ...invalid })),
      ).not.toHaveLength(0);
    expect(plainToInstance(MakeupMutationDto, body).reason).toBe('Equivalent content');
    expect(
      await validate(plainToInstance(MakeupListQueryDto, { status: 'INVALID' })),
    ).not.toHaveLength(0);
  });
  it('accepts a guest-only batch with records empty and rejects duplicate, null, empty and invalid guest data', async () => {
    const guest = { makeupPlacementId: uuid, status: 'PRESENT' },
      valid = { expectedVersion: 1, records: [], guestRecords: [guest] };
    expect(await validate(plainToInstance(MarkAttendanceDto, valid))).toHaveLength(0);
    for (const invalid of [
      { guestRecords: [] },
      { guestRecords: null },
      { guestRecords: [guest, guest] },
      { guestRecords: [{ ...guest, makeupPlacementId: 'bad' }] },
      { guestRecords: [{ ...guest, status: 'LATE' }] },
      { records: null },
    ])
      expect(
        await validate(plainToInstance(MarkAttendanceDto, { ...valid, ...invalid })),
      ).not.toHaveLength(0);
  });
});
