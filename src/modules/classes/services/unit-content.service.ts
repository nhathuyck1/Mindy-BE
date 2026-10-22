import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager, In } from 'typeorm';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { CoursesService } from '../../catalog/services/courses.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { UsersService } from '../../users/users.service.js';
import type { ClassContentContext } from '../domain/class-content-context.js';
import { ClassUnitManagementDto } from '../dtos/class.dto.js';
import { MentorContentUnitPageDto } from '../dtos/unit-content.dto.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ClassContentContextService } from './class-content-context.service.js';
// biome-ignore lint/style/useImportType: Nest requires runtime constructor metadata.
import { MentorWorkspaceService } from './mentor-workspace.service.js';

@Injectable()
export class UnitContentService {
  constructor(
    private readonly db: DataSource,
    private readonly workspace: MentorWorkspaceService,
    private readonly contexts: ClassContentContextService,
    private readonly users: UsersService,
    private readonly courses: CoursesService,
  ) {}

  async list(
    principal: AuthenticatedUser,
    classId: string,
    options: PageOptionsDto,
  ): Promise<MentorContentUnitPageDto> {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const [units, total] = await manager.getRepository(ClassUnitEntity).findAndCount({
        where: { classId },
        order: { position: 'ASC', id: 'ASC' },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      });
      // Authorize even empty pages; class existence/assignment comes from server context.
      const first = await manager
        .getRepository(ClassUnitEntity)
        .findOne({ where: { classId }, order: { position: 'ASC' } });
      if (!first)
        throw new AppHttpException(404, 'CLASS_UNIT_NOT_FOUND', 'The class unit was not found');
      await this.authorize(
        principal,
        await this.contexts.getUnit(first.id, classId, manager),
        manager,
      );
      const source = await this.courses.findUnitsByIds(
        units.map((unit) => unit.courseUnitId),
        manager,
      );
      const sessions = units.length
        ? await manager.getRepository(ClassSessionEntity).find({
            where: { classUnitId: In(units.map((unit) => unit.id)) },
            order: { sessionNumber: 'ASC' },
          })
        : [];
      const items = units.map(
        (unit) =>
          new ClassUnitManagementDto({
            unit,
            title: source.get(unit.courseUnitId)?.title ?? '',
            sessions: sessions.filter((s) => s.classUnitId === unit.id),
          }),
      );
      return new MentorContentUnitPageDto(items, options.page, options.pageSize, total);
    });
  }

  async detail(
    principal: AuthenticatedUser,
    classId: string,
    unitId: string,
  ): Promise<ClassUnitManagementDto> {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const context = await this.contexts.getUnit(unitId, classId, manager);
      if (principal.role === UserRole.MENTOR) {
        if (context.classStatus === ClassStatus.CANCELLED)
          throw new AppHttpException(
            403,
            'MATERIAL_ACCESS_DENIED',
            'Current class assignment is required',
          );
        const scope = await this.workspace.scope(manager, principal, classId);
        await this.workspace.assertUnit(manager, principal, scope, unitId);
      } else await this.authorize(principal, context, manager);
      const unit = await manager
        .getRepository(ClassUnitEntity)
        .findOneByOrFail({ id: unitId, classId });
      const source = await this.courses.findUnitsByIds([unit.courseUnitId], manager);
      const sessions =
        principal.role === UserRole.MENTOR
          ? []
          : await manager
              .getRepository(ClassSessionEntity)
              .find({ where: { classUnitId: unitId }, order: { sessionNumber: 'ASC' } });
      return new ClassUnitManagementDto({
        unit,
        title: source.get(unit.courseUnitId)?.title ?? '',
        sessions,
      });
    });
  }

  private async authorize(
    principal: AuthenticatedUser,
    context: ClassContentContext,
    manager: EntityManager,
  ): Promise<void> {
    const actor = await this.users.findActiveByRole(principal.userId, principal.role, manager);
    if (
      !actor ||
      (actor.role !== UserRole.ADMIN &&
        (actor.role !== UserRole.MENTOR ||
          context.mentorId !== actor.id ||
          context.classStatus === ClassStatus.CANCELLED))
    )
      throw new AppHttpException(
        403,
        'MATERIAL_ACCESS_DENIED',
        'Current class assignment is required',
      );
  }
}
