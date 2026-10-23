import 'reflect-metadata';
import type { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ClassEntity } from '../../classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../classes/entities/class-session.entity.js';
import type { CreateLeaveInput } from '../dtos/leave.dto.js';
import { LeavePlanningService } from './leave-planning.service.js';

const zone = 'Asia/Ho_Chi_Minh';
const source = Object.assign(new ClassSessionEntity(), {
  id: 'source',
  startsAt: new Date('2026-11-02T08:00:00+07:00'),
  endsAt: new Date('2026-11-02T09:00:00+07:00'),
});
const planning = new LeavePlanningService();
const sources = [{ classId: 'class', session: source }];
const input: CreateLeaveInput = {
  fromDate: '2026-11-02',
  toDate: '2026-11-02',
  period: 'FULL_DAY',
  reason: 'Leave',
  sourceVersions: [{ sessionId: source.id, version: 1 }],
  sessionMappings: [
    {
      sourceSessionId: source.id,
      targetDate: '2026-11-10',
      targetPeriod: 'FULL_DAY',
      startsAt: '2026-11-10T15:00:00+07:00',
      endsAt: '2026-11-10T16:00:00+07:00',
    },
  ],
};
const classes = new Map([['class', Object.assign(new ClassEntity(), { startDate: '2026-11-01' })]]);

describe('Flexible leave makeup planning', () => {
  it('allows a full-day leave to move to a different clock in a later week', () => {
    expect(planning.mappings(input, sources, zone)[0]).toMatchObject({
      startsAt: new Date('2026-11-10T15:00:00+07:00'),
      endsAt: new Date('2026-11-10T16:00:00+07:00'),
    });
  });
  it('retains compatibility with day mappings and their original clock', () => {
    expect(
      planning.mappings(
        {
          ...input,
          sessionMappings: undefined,
          dayMappings: [{ sourceDate: '2026-11-02', targetDate: '2026-11-10' }],
        },
        sources,
        zone,
      )[0]?.startsAt,
    ).toEqual(new Date('2026-11-10T08:00:00+07:00'));
  });
  it('rejects mixed, missing, duplicate mappings, changed duration and targets outside the selected period', () => {
    const mapping = input.sessionMappings?.[0];
    if (!mapping) throw new Error('Missing fixture');
    for (const invalid of [
      { ...input, dayMappings: [{ sourceDate: '2026-11-02', targetDate: '2026-11-10' }] },
      { ...input, sessionMappings: [] },
      { ...input, sessionMappings: [mapping, mapping] },
      { ...input, sessionMappings: [{ ...mapping, endsAt: '2026-11-10T17:00:00+07:00' }] },
      { ...input, sessionMappings: [{ ...mapping, targetPeriod: 'MORNING' as const }] },
    ])
      expect(() => planning.mappings(invalid, sources, zone)).toThrow();
  });
  it('blocks full-day same-date makeup and partial-day overlap but allows the exact end boundary', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const manager = { query } as unknown as EntityManager;
    const target = {
      sourceSessionId: source.id,
      classId: 'class',
      startsAt: new Date('2026-11-02T12:00:00+07:00'),
      endsAt: new Date('2026-11-02T13:00:00+07:00'),
    };
    const now = new Date('2026-10-23');
    await expect(
      planning.validate(
        manager,
        'mentor',
        'FULL_DAY',
        [target],
        classes,
        planning.intervals(input, zone),
        zone,
        now,
      ),
    ).rejects.toMatchObject({ response: { code: 'LEAVE_TARGET_CONFLICT' } });
    await expect(
      planning.validate(
        manager,
        'mentor',
        'MORNING',
        [target],
        classes,
        planning.intervals({ ...input, period: 'MORNING' }, zone),
        zone,
        now,
      ),
    ).resolves.toEqual({ total: 0, items: [] });
    const overlap = { ...target, startsAt: new Date('2026-11-02T11:30:00+07:00') };
    await expect(
      planning.validate(
        manager,
        'mentor',
        'MORNING',
        [overlap],
        classes,
        planning.intervals({ ...input, period: 'MORNING' }, zone),
        zone,
        now,
      ),
    ).rejects.toThrow();
  });
  it('rejects student conflicts for full-day leave too, even when a caller bypasses slot discovery', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: '1' }]);
    await expect(
      planning.validate(
        { query } as unknown as EntityManager,
        'mentor',
        'FULL_DAY',
        planning.mappings(input, sources, zone),
        classes,
        planning.intervals(input, zone),
        zone,
        new Date('2026-10-23'),
      ),
    ).rejects.toMatchObject({ response: { code: 'LEAVE_STUDENT_CONFLICT' } });
  });
});
