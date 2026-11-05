import 'reflect-metadata';
import {
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Use compiled controllers to exercise production decorator metadata and DI.
const compiled = new URL('../../dist/modules/', import.meta.url);
const {
  DashboardController,
}: typeof import('../../src/modules/dashboard/dashboard.controller.js') = await import(
  new URL('dashboard/dashboard.controller.js', compiled).href
);
const { DashboardService }: typeof import('../../src/modules/dashboard/dashboard.service.js') =
  await import(new URL('dashboard/dashboard.service.js', compiled).href);
const { AccessTokenGuard }: typeof import('../../src/modules/auth/guards/access-token.guard.js') =
  await import(new URL('auth/guards/access-token.guard.js', compiled).href);

describe('Compiled Dashboard HTTP contract', () => {
  let app: INestApplication;
  let base: string;
  const overview = vi.fn().mockResolvedValue({ summary: {}, courses: [], mentors: [] });
  const manager = vi.fn().mockResolvedValue({ summary: { collectedAmount: '0' } });
  const mentor = vi.fn().mockResolvedValue({ summary: { assignedSessions: 0 }, upcoming: [] });
  const services = { admin: overview, manager, mentor };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: { overview, manager, mentor } }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const request = context.switchToHttp().getRequest<{
            headers: Record<string, string | undefined>;
            user?: { userId: string; sessionId: string; role: string };
          }>();
          const role = request.headers['x-test-role'];
          if (!role) throw new UnauthorizedException();
          request.user = {
            userId: '11111111-1111-4111-8111-111111111111',
            sessionId: 'test',
            role,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        errorHttpStatusCode: 422,
      }),
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('rejects anonymous callers before invoking the service', async () => {
    overview.mockClear();
    expect((await fetch(`${base}/api/v1/admin/dashboard`)).status).toBe(401);
    expect(overview).not.toHaveBeenCalled();
  });
  it.each(['admin', 'manager', 'mentor'] as const)(
    'validates query, role and production wiring for %s',
    async (role) => {
      const service = services[role];
      service.mockClear();
      const headers = { 'x-test-role': role.toUpperCase() };
      const response = await fetch(`${base}/api/v1/${role}/dashboard?days=30`, { headers });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(await service.mock.results[0]?.value);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(service).toHaveBeenCalledWith(
        expect.objectContaining({ role: role.toUpperCase() }),
        30,
      );
      expect((await fetch(`${base}/api/v1/${role}/dashboard?days=31`, { headers })).status).toBe(
        422,
      );
      expect(
        (await fetch(`${base}/api/v1/${role}/dashboard?mentorId=other`, { headers })).status,
      ).toBe(422);
      expect(
        (await fetch(`${base}/api/v1/${role}/dashboard`, { headers: { 'x-test-role': 'STUDENT' } }))
          .status,
      ).toBe(403);
      if (role === 'mentor')
        expect((await fetch(`${base}/api/v1/admin/dashboard`, { headers })).status).toBe(403);
    },
  );
});
