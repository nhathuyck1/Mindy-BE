import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { UserEntity } from '../users/user.entity.js';
import { UserRole } from '../users/user-role.enum.js';
import { UsersService } from '../users/users.service.js';
import { TrackingQueryDto } from './tracking.dto.js';
import { TrackingService } from './tracking.service.js';

describe('Tracking role filter', () => {
  it('applies the role and source before both count and pagination', async () => {
    const db = new DataSource({ type: 'postgres' });
    vi.spyOn(db, 'transaction').mockImplementation(async (isolation, callback) => {
      const work = callback ?? isolation;
      if (typeof work !== 'function') throw new Error('Expected callback');
      return work(db.manager);
    });
    const users = new UsersService(db.getRepository(UserEntity));
    vi.spyOn(users, 'findActiveByRole').mockResolvedValue(
      Object.assign(new UserEntity(), { id: 'admin' }),
    );
    const query = vi
      .spyOn(db.manager, 'query')
      .mockResolvedValueOnce([{ total: 21 }])
      .mockResolvedValueOnce([]);
    const service = new TrackingService(db, users);
    const result = await service.list(
      { userId: 'admin', role: UserRole.ADMIN, sessionId: 'session' },
      { page: 2, pageSize: 20, actorRole: UserRole.MENTOR, source: 'system_rule_audits' },
    );
    expect(result.total).toBe(21);
    for (const [sql] of query.mock.calls) {
      expect(sql).toContain('LEFT JOIN users actor ON actor.id=e.actor_id');
      expect(sql).toContain('e.source=$1 AND actor.role=$2');
    }
    expect(query.mock.calls[0]?.[1]).toEqual(['system_rule_audits', 'MENTOR']);
    expect(query.mock.calls[1]?.[1]).toEqual(['system_rule_audits', 'MENTOR', 20, 20]);
  });

  it.each(['ADMIN', 'MANAGER', 'MENTOR', 'STUDENT'])(
    'accepts role %s together with system rule source',
    async (actorRole) => {
      const dto = plainToInstance(TrackingQueryDto, {
        page: 1,
        pageSize: 20,
        actorRole,
        source: 'system_rule_audits',
      });
      expect(await validate(dto)).toEqual([]);
    },
  );

  it('rejects an unsupported actor role', async () => {
    expect(
      (await validate(plainToInstance(TrackingQueryDto, { actorRole: 'OWNER' }))).some(
        (error) => error.property === 'actorRole',
      ),
    ).toBe(true);
  });
});
