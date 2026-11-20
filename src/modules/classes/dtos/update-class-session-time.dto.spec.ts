import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
  BulkUpdateClassSessionTimeDto,
  UpdateClassSessionTimeDto,
} from './update-class-session-time.dto.js';

const TIMES = { startTime: '07:30', endTime: '09:30' };
const VALIDATION = { whitelist: true, forbidNonWhitelisted: true };

describe('session clock-time requests', () => {
  it('accepts strict 24-hour clock times, including midnight', async () => {
    for (const startTime of ['00:00', '07:30', '23:59']) {
      expect(
        await validate(
          plainToInstance(UpdateClassSessionTimeDto, { ...TIMES, startTime }),
          VALIDATION,
        ),
      ).toEqual([]);
    }
  });

  it.each(['7:30', '24:00', '09:60', '07:30:00', '2026-10-13T07:30:00+07:00', '', null, 730])(
    'rejects invalid clock time %s',
    async (startTime) => {
      const errors = await validate(
        plainToInstance(UpdateClassSessionTimeDto, { ...TIMES, startTime }),
        VALIDATION,
      );
      expect(errors.map((error) => error.property)).toContain('startTime');
    },
  );

  it('requires both times and refuses date changes in a time-only request', async () => {
    const errors = await validate(
      plainToInstance(UpdateClassSessionTimeDto, {
        startTime: '07:30',
        startsAt: '2026-10-13T00:30:00Z',
      }),
      VALIDATION,
    );
    expect(errors.map((error) => error.property).sort()).toEqual(['endTime', 'startsAt']);
  });

  it('accepts 1-100 unique UUIDs and validates inherited clock times', async () => {
    expect(
      await validate(
        plainToInstance(BulkUpdateClassSessionTimeDto, {
          ...TIMES,
          sessionIds: Array.from({ length: 100 }, () => randomUUID()),
        }),
        VALIDATION,
      ),
    ).toEqual([]);
    const id = randomUUID();
    for (const sessionIds of [
      [],
      [id, id],
      ['not-a-uuid'],
      Array.from({ length: 101 }, () => randomUUID()),
      id,
    ]) {
      const errors = await validate(
        plainToInstance(BulkUpdateClassSessionTimeDto, { ...TIMES, sessionIds }),
        VALIDATION,
      );
      expect(errors.map((error) => error.property)).toContain('sessionIds');
    }
    expect(
      (
        await validate(
          plainToInstance(BulkUpdateClassSessionTimeDto, {
            ...TIMES,
            sessionIds: [id],
            endTime: '24:00',
          }),
          VALIDATION,
        )
      ).map((error) => error.property),
    ).toEqual(['endTime']);
  });
});
