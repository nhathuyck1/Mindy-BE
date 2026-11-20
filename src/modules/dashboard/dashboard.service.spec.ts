import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/user-role.enum.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardQueryDto } from './dashboard.dto.js';
import { DashboardService, dashboardPeriod } from './dashboard.service.js';

describe('Dashboard policy and time boundaries', () => {
  it('uses Vietnam calendar days across month/year boundaries', () => {
    const now = new Date('2026-12-31T18:00:00Z');
    expect(dashboardPeriod(30, now)).toEqual({
      from: new Date('2026-12-02T17:00:00Z'),
      to: now,
    });
    expect(dashboardPeriod(365, now).from.toISOString()).toBe('2026-01-01T17:00:00.000Z');
  });

  it.each(['30', '90', '365'])('accepts the bounded %s day filter', async (days) => {
    expect(await validate(plainToInstance(DashboardQueryDto, { days }))).toHaveLength(0);
  });
  it.each(['0', '-1', '31', '366', 'abc', ['30', '90']])(
    'rejects invalid filter %s',
    async (days) => {
      expect((await validate(plainToInstance(DashboardQueryDto, { days }))).length).toBeGreaterThan(
        0,
      );
    },
  );

  it.each(['admin', 'manager', 'mentor'] as const)(
    'allows only the matching role on %s dashboard',
    (method) => {
      const guard = new RolesGuard(new Reflector());
      for (const role of Object.values(UserRole)) {
        const context = new ExecutionContextHost(
          [{ user: { role } }],
          DashboardController,
          DashboardController.prototype[method],
        );
        if (role.toLowerCase() === method) expect(guard.canActivate(context)).toBe(true);
        else expect(() => guard.canActivate(context)).toThrow();
      }
    },
  );

  it('binds mentor identity from the authenticated actor and blocks students before querying', async () => {
    const db = new DataSource({ type: 'postgres' });
    const query = vi.spyOn(db, 'query').mockResolvedValue([
      {
        summary: {},
        courses: [],
        mentors: [],
        classes: [],
        trend: [],
        classStatuses: [],
      },
    ]);
    const service = new DashboardService(db);
    const actor = {
      userId: '11111111-1111-4111-8111-111111111111',
      sessionId: 'session',
      role: UserRole.MENTOR,
    };
    expect((await service.overview(actor, 90)).scope).toBe('MENTOR');
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(actor.userId);
    await service.overview({ ...actor, role: UserRole.ADMIN }, 90);
    expect(query.mock.calls[1]?.[1]?.[0]).toBeNull();
    await expect(service.overview({ ...actor, role: UserRole.STUDENT }, 90)).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
