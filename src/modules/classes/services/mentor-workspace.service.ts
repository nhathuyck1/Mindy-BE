import { Injectable, UnprocessableEntityException } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { CoursesService } from '../../catalog/services/courses.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { UsersService } from '../../users/users.service.js';
import { EFFECTIVE_MENTOR_SQL } from '../domain/effective-mentor.js';
import type { MentorWorkspaceQueryDto } from '../dtos/mentor-workspace.dto.js';
import type { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TeachingReadService } from './teaching-read.service.js';

export interface MentorClassScope {
  readonly classId: string;
  readonly accessScope: 'CLASS' | 'SESSION';
  readonly assignmentType: 'PRIMARY' | 'SUBSTITUTE' | 'BOTH';
  readonly readonly: boolean;
}

/** Classes owns assignment decisions. Consumers must resolve this on every request. */
@Injectable()
export class MentorWorkspaceService {
  constructor(
    private readonly db: DataSource,
    private readonly users: UsersService,
    private readonly teaching: TeachingReadService,
    private readonly courses: CoursesService,
  ) {}

  async scope(
    m: EntityManager,
    actor: AuthenticatedUser,
    classId: string,
    primaryOnly = false,
  ): Promise<MentorClassScope> {
    await this.actor(m, actor);
    const c = await this.teaching.loadClass(m, classId);
    const primary = c.mentorId === actor.userId;
    const assigned = await this.teaching
      .sessionQuery(m)
      .where('c.id=:classId', { classId })
      .andWhere(`${EFFECTIVE_MENTOR_SQL}=:mentorId`, { mentorId: actor.userId })
      .andWhere('(s.mentor_override_id IS NOT NULL OR c.mentor_id<>:mentorId)')
      .getExists();
    if ((!primary && !assigned) || (primaryOnly && !primary)) this.deny();
    return {
      classId,
      accessScope: primary ? 'CLASS' : 'SESSION',
      assignmentType: primary ? (assigned ? 'BOTH' : 'PRIMARY') : 'SUBSTITUTE',
      readonly: [ClassStatus.CANCELLED, ClassStatus.COMPLETED].includes(c.status),
    };
  }

  async actor(m: EntityManager, actor: AuthenticatedUser): Promise<void> {
    if (
      actor.role !== UserRole.MENTOR ||
      !(await this.users.findActiveByRole(actor.userId, UserRole.MENTOR, m))
    )
      this.deny();
  }

  sessionsQuery(
    m: EntityManager,
    actor: AuthenticatedUser,
    scope: MentorClassScope,
  ): SelectQueryBuilder<ClassSessionEntity> {
    const q = this.teaching.sessionQuery(m).where('c.id=:classId', { classId: scope.classId });
    if (scope.accessScope === 'SESSION')
      q.andWhere(`${EFFECTIVE_MENTOR_SQL}=:mentorId`, { mentorId: actor.userId });
    return q;
  }

  unitsQuery(
    m: EntityManager,
    actor: AuthenticatedUser,
    scope: MentorClassScope,
  ): SelectQueryBuilder<ClassUnitEntity> {
    const q = m
      .getRepository(ClassUnitEntity)
      .createQueryBuilder('unit')
      .where('unit.classId=:classId', { classId: scope.classId });
    if (scope.accessScope === 'SESSION')
      q.andWhere(
        `EXISTS(SELECT 1 FROM class_sessions s JOIN classes c ON c.id=s.class_id
      WHERE s.class_unit_id=unit.id AND ${EFFECTIVE_MENTOR_SQL}=:mentorId)`,
        { mentorId: actor.userId },
      );
    return q;
  }

  async assertUnit(
    m: EntityManager,
    actor: AuthenticatedUser,
    scope: MentorClassScope,
    unitId: string,
  ): Promise<void> {
    if (
      !(await this.unitsQuery(m, actor, scope).andWhere('unit.id=:unitId', { unitId }).getExists())
    )
      throw new AppHttpException(404, 'CLASS_UNIT_NOT_FOUND', 'Class unit not found');
  }

  async detail(
    actor: AuthenticatedUser,
    classId: string,
  ): Promise<import('../dtos/mentor-workspace.dto.js').MentorWorkspaceDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await m.query('SET TRANSACTION READ ONLY');
      const scope = await this.scope(m, actor, classId);
      const c = await this.teaching.loadClass(m, classId);
      const course = (await this.courses.findByIds([c.courseId], m)).get(c.courseId);
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        status: c.status,
        course: { id: c.courseId, title: course?.title ?? '' },
        ...scope,
        capabilities: {
          readClass: true,
          readClassRoster: scope.accessScope === 'CLASS',
          readClassReports: scope.accessScope === 'CLASS',
          authorMaterials: scope.accessScope === 'CLASS' && c.status !== ClassStatus.CANCELLED,
        },
        visibleUnitCount: await this.unitsQuery(m, actor, scope).getCount(),
        visibleSessionCount: await this.sessionsQuery(m, actor, scope).getCount(),
        asOf: new Date(),
        timeZone: this.teaching.timeZone(),
      };
    });
  }

  async sessions(
    actor: AuthenticatedUser,
    classId: string,
    query: MentorWorkspaceQueryDto,
  ): Promise<import('../dtos/mentor-workspace.dto.js').MentorWorkspaceSessionPageDto> {
    if (
      query.from !== undefined &&
      (!(new Date(query.from) < new Date(query.to ?? '')) ||
        new Date(query.to ?? '').getTime() - new Date(query.from).getTime() > 93 * 86400000)
    )
      throw new UnprocessableEntityException('Range must be paired, positive and at most 93 days');
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await m.query('SET TRANSACTION READ ONLY');
      const scope = await this.scope(m, actor, classId);
      if (query.unitId) await this.assertUnit(m, actor, scope, query.unitId);
      const q = this.sessionsQuery(m, actor, scope);
      if (query.unitId) q.andWhere('s.classUnitId=:unitId', { unitId: query.unitId });
      if (query.from)
        q.andWhere('s.startsAt<:to AND s.endsAt>:from', {
          from: new Date(query.from),
          to: new Date(query.to ?? ''),
        });
      const [rows, total] = await q
        .orderBy('s.startsAt', 'ASC')
        .addOrderBy('s.id', 'ASC')
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getManyAndCount();
      const classEntity = await this.teaching.loadClass(m, classId);
      return {
        items: (await this.teaching.sessionViews(m, rows, new Date())).map((session) => ({
          ...session,
          capabilities: {
            readSessionContext: session.effectiveMentor?.id === actor.userId,
            writeTeachingNotes:
              classEntity.status !== ClassStatus.CANCELLED &&
              session.effectiveMentor?.id === actor.userId &&
              [SessionStatus.IN_PROGRESS, SessionStatus.COMPLETED].includes(session.status) &&
              session.editableUntil !== null &&
              session.editableUntil > new Date(),
          },
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  private deny(): never {
    throw new AppHttpException(
      403,
      'MENTOR_SCOPE_REQUIRED',
      'Current mentor assignment is required',
    );
  }
}
