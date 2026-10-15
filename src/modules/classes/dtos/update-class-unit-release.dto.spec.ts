import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateClassUnitReleaseDto } from './update-class-unit-release.dto.js';

const errors = (body: object) =>
  validate(plainToInstance(UpdateClassUnitReleaseDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
describe('Class Unit release input', () => {
  it.each([
    undefined,
    null,
    '2026-10-13T12:00:00Z',
    '2026-10-13T19:00:00.001+07:00',
    '0001-01-01T00:00:00Z',
    '9999-12-31T23:59:59.999Z',
    '2000-02-29T00:00:00-07:00',
  ])('accepts explicit timezone/past/bounds/optional %s', async (unlockAt) => {
    expect(
      await errors({ status: 'OPEN', ...(unlockAt === undefined ? {} : { unlockAt }) }),
    ).toEqual([]);
  });
  it.each([
    '2026-10-13',
    '2026-10-13T12:00:00',
    '2026-02-30T12:00:00Z',
    '2026-10-13T12:00:00+25:00',
    '0000-01-01T00:00:00Z',
    '0001-01-01T00:00:00+07:00',
    '9999-12-31T23:59:59-07:00',
    '2026-10-13T24:00:00Z',
    '10000-01-01T00:00:00Z',
    '2026-10-13T12:00:00.0001Z',
    '',
    1,
    false,
  ])('rejects invalid timestamp %s', async (unlockAt) => {
    expect((await errors({ status: 'OPEN', unlockAt })).length).toBeGreaterThan(0);
  });
  it.each([{}, { status: null }, { status: 'COMPLETED' }, { status: 'OPEN', expectedRevision: 1 }])(
    'rejects status/extra fields %j',
    async (body) => {
      expect((await errors(body)).length).toBeGreaterThan(0);
    },
  );
});
