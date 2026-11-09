import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ClassEntity } from '../entities/class.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { ClassOpeningService } from './class-opening.service.js';

describe('Class opening cutoff policy', () => {
  it.each([2, 3, 4])(
    'demo waives time but preserves the minimum paid active students (%i)',
    async (count) => {
      const db = new DataSource({ type: 'postgres' });
      vi.spyOn(db.manager, 'query').mockResolvedValue([
        {
          classId: 'class',
          activeStudentCount: count,
          cutoffCount: count,
          scheduledStartAt: new Date('2026-11-05T02:30:00Z'),
          now: new Date('2026-11-04T02:30:00Z'),
          blocked: false,
        },
      ]);
      const c = Object.assign(new ClassEntity(), { id: 'class', status: ClassStatus.OPEN });
      const start = new ClassOpeningService(db).assertCanStart(db.manager, c, true);
      if (count < 3) await expect(start).rejects.toThrow('TOO_EARLY');
      else await expect(start).resolves.toBeUndefined();
    },
  );
  it.each([2, 3, 4])(
    'requires at least 3 paid active students at scheduled start (%i)',
    async (count) => {
      const db = new DataSource({ type: 'postgres' });
      vi.spyOn(db.manager, 'query').mockResolvedValue([
        {
          classId: 'class',
          activeStudentCount: count,
          cutoffCount: count,
          scheduledStartAt: new Date('2026-11-05T02:30:00Z'),
          now: new Date('2026-11-05T02:30:00Z'),
          blocked: false,
        },
      ]);
      const c = Object.assign(new ClassEntity(), { id: 'class', status: ClassStatus.OPEN });
      expect((await new ClassOpeningService(db).eligibility(db.manager, c)).startEligibility).toBe(
        count < 3 ? 'RESCHEDULE_REQUIRED' : 'ELIGIBLE',
      );
    },
  );
  it('does not count late settlements after a failed opening, even on a restarted worker', async () => {
    const db = new DataSource({ type: 'postgres' });
    vi.spyOn(db.manager, 'query').mockResolvedValue([
      {
        classId: 'class',
        activeStudentCount: 4,
        cutoffCount: 2,
        scheduledStartAt: new Date('2026-11-05T02:30:00Z'),
        now: new Date('2026-11-05T04:00:00Z'),
        blocked: true,
      },
    ]);
    const c = Object.assign(new ClassEntity(), { id: 'class', status: ClassStatus.OPEN });
    await expect(new ClassOpeningService(db).assertCanStart(db.manager, c)).rejects.toThrow(
      'RESCHEDULE_REQUIRED',
    );
  });
  it('blocks manual starts before the first session even with four students', async () => {
    const db = new DataSource({ type: 'postgres' });
    vi.spyOn(db.manager, 'query').mockResolvedValue([
      {
        classId: 'class',
        activeStudentCount: 4,
        cutoffCount: 4,
        scheduledStartAt: new Date('2026-11-05T02:30:00Z'),
        now: new Date('2026-11-05T02:29:59Z'),
        blocked: false,
      },
    ]);
    const c = Object.assign(new ClassEntity(), { id: 'class', status: ClassStatus.OPEN });
    await expect(new ClassOpeningService(db).assertCanStart(db.manager, c)).rejects.toThrow(
      'TOO_EARLY',
    );
  });
});
