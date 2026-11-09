import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ClassEntity } from '../classes/entities/class.entity.js';
import { ClassSessionEntity } from '../classes/entities/class-session.entity.js';
import { ClassStatus } from '../classes/enums/class-status.enum.js';
import { SessionStatus } from '../classes/enums/session-status.enum.js';
import { ClassOpeningService } from '../classes/services/class-opening.service.js';
import { SessionLifecycleService } from '../classes/services/session-lifecycle.service.js';
import { UpdateSystemRuleDto } from './system-rules.controller.js';
import { SystemRulesService } from './system-rules.service.js';
import { SESSION_START_TIME_RULE, sessionStartTimeEnforced } from './system-settings.js';

describe('System rules', () => {
  it.each([true, false, undefined])(
    'reads the rule without caching; missing defaults to enabled (%s)',
    async (value) => {
      const db = new DataSource({ type: 'postgres' });
      vi.spyOn(db.manager, 'query').mockResolvedValue(value === undefined ? [] : [{ value }]);
      expect(await sessionStartTimeEnforced(db.manager)).toBe(value !== false);
    },
  );

  it.each([null, 'false', 0])('rejects non-boolean rule values (%s)', async (value) => {
    const dto = plainToInstance(UpdateSystemRuleDto, { value, expectedVersion: 1, reason: 'Demo' });
    expect((await validate(dto)).some((error) => error.property === 'value')).toBe(true);
  });

  it('rejects stale versions before updating or writing an audit', async () => {
    const db = new DataSource({ type: 'postgres' });
    vi.spyOn(db, 'transaction').mockImplementation(async (isolation, callback) => {
      const work = callback ?? isolation;
      if (typeof work !== 'function') throw new Error('Expected transaction callback');
      return work(db.manager);
    });
    const query = vi.spyOn(db.manager, 'query').mockResolvedValue([{ version: 2, value: true }]);
    await expect(
      new SystemRulesService(db).update(
        SESSION_START_TIME_RULE,
        { value: false, expectedVersion: 1, reason: 'Demo' },
        'admin',
      ),
    ).rejects.toThrow('Rule changed');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('updates and audits the old/new value and actor in one transaction', async () => {
    const db = new DataSource({ type: 'postgres' });
    vi.spyOn(db, 'transaction').mockImplementation(async (isolation, callback) => {
      const work = callback ?? isolation;
      if (typeof work !== 'function') throw new Error('Expected transaction callback');
      return work(db.manager);
    });
    const query = vi
      .spyOn(db.manager, 'query')
      .mockResolvedValueOnce([{ version: 1, value: true }])
      .mockResolvedValueOnce([{ key: SESSION_START_TIME_RULE, version: 2, value: false }])
      .mockResolvedValueOnce([]);
    const result = await new SystemRulesService(db).update(
      SESSION_START_TIME_RULE,
      { value: false, expectedVersion: 1, reason: 'Demo' },
      'admin',
    );
    expect(result.value).toBe(false);
    expect(query.mock.calls[2]?.[1]).toEqual([
      SESSION_START_TIME_RULE,
      true,
      false,
      'admin',
      'Demo',
      2,
    ]);
  });

  it.each([true, false])(
    'enforces future session time unless Admin disabled it (%s)',
    async (value) => {
      const db = new DataSource({ type: 'postgres' });
      const query = vi
        .spyOn(db.manager, 'query')
        .mockImplementation(async (sql: string) =>
          sql.includes('SELECT value') ? [{ value }] : [],
        );
      vi.spyOn(db.manager.getRepository(ClassSessionEntity), 'save').mockImplementation(
        async (s) => s as ClassSessionEntity,
      );
      const lifecycle = new SessionLifecycleService(
        new ConfigService({ APP_TIME_ZONE: 'Asia/Ho_Chi_Minh' }),
        new ClassOpeningService(db),
      );
      const session = Object.assign(new ClassSessionEntity(), {
        id: 'session',
        status: SessionStatus.SCHEDULED,
        startsAt: new Date('2026-11-15T02:00:00Z'),
        version: 1,
      });
      const c = Object.assign(new ClassEntity(), {
        status: ClassStatus.IN_PROGRESS,
        mentorId: 'mentor',
      });
      const start = lifecycle.start(
        db.manager,
        c,
        session,
        'mentor',
        new Date('2026-11-09T02:00:00Z'),
      );
      if (value) await expect(start).rejects.toThrow('scheduled time');
      else {
        await start;
        expect(session.status).toBe(SessionStatus.IN_PROGRESS);
        expect(query.mock.calls.at(-1)?.[1]?.[4]).toBe('Schedule rule disabled.');
      }
    },
  );
});
