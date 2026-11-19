import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { CoursesService } from '../../catalog/services/courses.service.js';
import type { ClassContentContextService } from '../../classes/services/class-content-context.service.js';
import type { MentorContentContextService } from '../../classes/services/mentor-content-context.service.js';
import type { FilesService } from '../../files/services/files.service.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { UsersService } from '../../users/users.service.js';
import { MaterialContentType, MaterialEntity } from '../entities/material.entity.js';
import { MaterialAuthoringService } from './material-authoring.service.js';
import type { MaterialPolicyService } from './material-policy.service.js';

function fixture() {
  const actor = { userId: randomUUID(), role: UserRole.MANAGER, sessionId: randomUUID() };
  const unitA = { id: randomUUID(), courseId: randomUUID(), title: 'Arrays', unitNumber: 2 };
  const unitB = { id: randomUUID(), courseId: randomUUID(), title: 'Grammar', unitNumber: 5 };
  const mentor = { id: randomUUID(), displayName: 'Mentor Lan', role: UserRole.MENTOR };
  const session = { id: randomUUID(), title: 'Practice', sessionNumber: 3 };
  const courses = {
    findUnitsByIds: vi.fn().mockResolvedValue(
      new Map([
        [unitB.id, unitB],
        [unitA.id, unitA],
      ]),
    ),
    findByIds: vi.fn().mockResolvedValue(
      new Map([
        [unitB.courseId, { id: unitB.courseId, title: 'English' }],
        [unitA.courseId, { id: unitA.courseId, title: 'Programming' }],
      ]),
    ),
  };
  const users = {
    findByIds: vi.fn().mockResolvedValue([
      { ...mentor, status: 'SUSPENDED', email: 'private@test.local', passwordHash: 'secret' },
      { id: actor.userId, displayName: 'Manager An', role: UserRole.MANAGER },
    ]),
  };
  const contexts = {
    findSessionSummariesByIds: vi
      .fn()
      .mockResolvedValue(
        new Map([[session.id, { ...session, meetingUrl: 'https://private.test/meeting' }]]),
      ),
  };
  const query = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getManyAndCount: vi.fn(),
    getMany: vi.fn().mockResolvedValue([]),
  };
  const manager = {
    query: vi.fn(),
    getRepository: vi.fn().mockReturnValue({ createQueryBuilder: () => query }),
  } as unknown as EntityManager;
  const db = {
    transaction: async (_isolation: string, work: (m: EntityManager) => Promise<unknown>) =>
      work(manager),
  } as unknown as DataSource;
  const policy = { actor: vi.fn().mockResolvedValue(actor) };
  const service = new MaterialAuthoringService(
    db,
    policy as unknown as MaterialPolicyService,
    { readSummaries: vi.fn().mockResolvedValue(new Map()) } as unknown as FilesService,
    courses as unknown as CoursesService,
    contexts as unknown as ClassContentContextService,
    {} as MentorContentContextService,
    users as unknown as UsersService,
  );
  function material(courseUnitId: string, createdBy: string, sessionId: string | null = null) {
    return Object.assign(new MaterialEntity(), {
      id: randomUUID(),
      courseUnitId,
      createdBy,
      sessionId,
      contentType: MaterialContentType.ARTICLE,
      title: 'Lesson',
      fileObjectId: null,
      contentHtml: '<p>Detail only</p>',
      createdInClassId: null,
    });
  }
  return {
    service,
    actor,
    mentor,
    unitA,
    unitB,
    session,
    query,
    courses,
    users,
    contexts,
    manager,
    policy,
    material,
  };
}

describe('Material inventory context', () => {
  it('attributes each row by ID across courses, with nullable sessions and no private fields', async () => {
    const f = fixture();
    const rows = [
      f.material(f.unitA.id, f.mentor.id, f.session.id),
      f.material(f.unitB.id, f.actor.userId),
      f.material(f.unitA.id, f.mentor.id),
    ];
    f.query.getManyAndCount.mockResolvedValue([rows, 12]);
    const result = await f.service.list(f.actor, { page: 2, pageSize: 3 });
    expect(result).toMatchObject({
      page: 2,
      pageSize: 3,
      total: 12,
      items: [
        {
          id: rows[0]?.id,
          courseId: f.unitA.courseId,
          courseTitle: 'Programming',
          courseUnitTitle: 'Arrays',
          courseUnitNumber: 2,
          sessionTitle: 'Practice',
          sessionNumber: 3,
          createdByName: 'Mentor Lan',
          createdByRole: 'MENTOR',
        },
        {
          id: rows[1]?.id,
          courseId: f.unitB.courseId,
          courseTitle: 'English',
          courseUnitTitle: 'Grammar',
          courseUnitNumber: 5,
          sessionTitle: null,
          sessionNumber: null,
          createdByName: 'Manager An',
          createdByRole: 'MANAGER',
        },
        {
          id: rows[2]?.id,
          courseTitle: 'Programming',
          sessionTitle: null,
          sessionNumber: null,
          createdByName: 'Mentor Lan',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/private@test|secret|meetingUrl|contentHtml/);
    expect(f.courses.findUnitsByIds).toHaveBeenCalledExactlyOnceWith(
      [f.unitA.id, f.unitB.id],
      f.manager,
    );
    expect(f.users.findByIds).toHaveBeenCalledExactlyOnceWith(
      [f.mentor.id, f.actor.userId],
      f.manager,
    );
    expect(f.contexts.findSessionSummariesByIds).toHaveBeenCalledExactlyOnceWith(
      [f.session.id],
      f.manager,
    );
  });

  it('preserves an empty page and total without looking up unrelated metadata', async () => {
    const f = fixture();
    f.query.getManyAndCount.mockResolvedValue([[], 12]);
    expect(await f.service.list(f.actor, { page: 20, pageSize: 3 })).toEqual({
      items: [],
      page: 20,
      pageSize: 3,
      total: 12,
    });
    expect(f.courses.findUnitsByIds).not.toHaveBeenCalled();
    expect(f.users.findByIds).not.toHaveBeenCalled();
    expect(f.contexts.findSessionSummariesByIds).not.toHaveBeenCalled();
  });

  it('denies a non-manager before reading inventory or attribution data', async () => {
    const f = fixture();
    const student = { ...f.actor, role: UserRole.STUDENT };
    f.policy.actor.mockResolvedValue(student);
    await expect(f.service.list(student, { page: 1, pageSize: 20 })).rejects.toMatchObject({
      status: 403,
    });
    expect(f.query.getManyAndCount).not.toHaveBeenCalled();
    expect(f.users.findByIds).not.toHaveBeenCalled();
  });
});
