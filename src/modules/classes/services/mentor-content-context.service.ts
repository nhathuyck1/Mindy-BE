import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { CoursesService } from '../../catalog/services/courses.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { UsersService } from '../../users/users.service.js';
import type { ClassContentContext } from '../domain/class-content-context.js';
import type {
  MentorContentSessionPageDto,
  MentorContentUnitPageDto,
} from '../dtos/mentor-content-context.dto.js';
import { ClassStatus } from '../enums/class-status.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ClassContentContextService } from './class-content-context.service.js';
// biome-ignore lint/style/useImportType: Nest requires runtime constructor metadata.
import { MentorWorkspaceService } from './mentor-workspace.service.js';

@Injectable()
export class MentorContentContextService {
  constructor(
    private readonly db: DataSource,
    private readonly workspace: MentorWorkspaceService,
    private readonly users: UsersService,
    private readonly courses: CoursesService,
    private readonly contexts: ClassContentContextService,
  ) {}

  async assertClassAccess(
    principal: AuthenticatedUser,
    classId: string,
    manager: EntityManager,
  ): Promise<void> {
    const actor = await this.users.findActiveByRole(principal.userId, principal.role, manager);
    if (actor?.role !== UserRole.MENTOR) this.deny();
    const row = await this.contexts.getClass(classId, manager);
    if (row.mentorId !== actor.id || row.status === ClassStatus.CANCELLED) this.deny();
  }

  async getUnitAccess(
    principal: AuthenticatedUser,
    classId: string,
    unitId: string,
    manager: EntityManager,
    readOnly = false,
  ): Promise<ClassContentContext> {
    const scope = readOnly ? await this.readScope(manager, principal, classId) : null;
    if (scope) await this.workspace.assertUnit(manager, principal, scope, unitId);
    else await this.assertClassAccess(principal, classId, manager);
    const context = await this.contexts.getUnit(unitId, classId, manager);
    if (context.classStatus === ClassStatus.CANCELLED) this.deny();
    const unit = await this.courses.getUnitContext(context.courseUnitId, manager);
    if (unit?.courseId !== context.courseId)
      throw new AppHttpException(
        422,
        'MATERIAL_SCOPE_MISMATCH',
        'The content scope does not match',
      );
    return scope ? { ...context, mentorReadScope: scope.accessScope } : context;
  }

  async units(
    principal: AuthenticatedUser,
    classId: string,
    options: PageOptionsDto,
  ): Promise<MentorContentUnitPageDto> {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      const scope = await this.readScope(manager, principal, classId);
      if ((await this.contexts.getClass(classId, manager)).status === ClassStatus.CANCELLED)
        this.deny();
      const [rows, total] = await this.workspace
        .unitsQuery(manager, principal, scope)
        .orderBy('unit.position', 'ASC')
        .addOrderBy('unit.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      const units = await this.courses.findUnitsByIds(
        rows.map((row) => row.courseUnitId),
        manager,
      );
      return {
        items: rows.map((row) => ({
          id: row.id,
          classId: row.classId,
          courseUnitId: row.courseUnitId,
          title: units.get(row.courseUnitId)?.title ?? '',
          position: row.position,
          status: row.status,
          unlockAt: row.unlockAt,
        })),
        page: options.page,
        pageSize: options.pageSize,
        total,
      };
    });
  }

  async sessions(
    principal: AuthenticatedUser,
    classId: string,
    unitId: string,
    options: PageOptionsDto,
  ): Promise<MentorContentSessionPageDto> {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      await this.getUnitAccess(principal, classId, unitId, manager, true);
      const scope = await this.readScope(manager, principal, classId);
      const [rows, total] = await this.workspace
        .sessionsQuery(manager, principal, scope)
        .andWhere('s.classUnitId=:unitId', { unitId })
        .orderBy('s.sessionNumber', 'ASC')
        .addOrderBy('s.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      return {
        items: rows.map((row) => ({
          id: row.id,
          classUnitId: row.classUnitId,
          title: row.title,
          sessionNumber: row.sessionNumber,
          status: row.status,
        })),
        page: options.page,
        pageSize: options.pageSize,
        total,
      };
    });
  }

  private async readScope(manager: EntityManager, principal: AuthenticatedUser, classId: string) {
    try {
      return await this.workspace.scope(manager, principal, classId);
    } catch (error) {
      if (error instanceof AppHttpException && error.getStatus() === 403) this.deny();
      throw error;
    }
  }

  private deny(): never {
    throw new AppHttpException(
      403,
      'MATERIAL_ACCESS_DENIED',
      'The material action is not allowed in its current context',
    );
  }
}
