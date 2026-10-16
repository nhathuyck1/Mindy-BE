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
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ClassContentContextService } from './class-content-context.service.js';

@Injectable()
export class MentorContentContextService {
  constructor(
    private readonly db: DataSource,
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
  ): Promise<ClassContentContext> {
    await this.assertClassAccess(principal, classId, manager);
    const context = await this.contexts.getUnit(unitId, classId, manager);
    const unit = await this.courses.getUnitContext(context.courseUnitId, manager);
    if (unit?.courseId !== context.courseId)
      throw new AppHttpException(
        422,
        'MATERIAL_SCOPE_MISMATCH',
        'The content scope does not match',
      );
    return context;
  }

  async units(
    principal: AuthenticatedUser,
    classId: string,
    options: PageOptionsDto,
  ): Promise<MentorContentUnitPageDto> {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      await this.assertClassAccess(principal, classId, manager);
      const [rows, total] = await manager.getRepository(ClassUnitEntity).findAndCount({
        where: { classId },
        order: { position: 'ASC', id: 'ASC' },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      });
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
      await this.getUnitAccess(principal, classId, unitId, manager);
      const [rows, total] = await manager.getRepository(ClassSessionEntity).findAndCount({
        where: { classUnitId: unitId },
        order: { sessionNumber: 'ASC', id: 'ASC' },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      });
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

  private deny(): never {
    throw new AppHttpException(
      403,
      'MATERIAL_ACCESS_DENIED',
      'The material action is not allowed in its current context',
    );
  }
}
