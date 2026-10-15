import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { CoursesService } from '../../catalog/services/courses.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { UsersService } from '../../users/users.service.js';
import type { MentorContentUnitDto } from '../dtos/mentor-content-context.dto.js';
import type { UpdateClassUnitReleaseDto } from '../dtos/update-class-unit-release.dto.js';
import { ClassEntity } from '../entities/class.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassUnitReleaseAuditEntity } from '../entities/class-unit-release-audit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { ClassUnitStatus } from '../enums/class-unit-status.enum.js';
import {
  ClassNotFoundException,
  ClassUnitNotFoundException,
  UnitReleaseConflictException,
} from '../exceptions/class.exceptions.js';

@Injectable()
export class ClassUnitReleaseService {
  constructor(
    private readonly db: DataSource,
    private readonly users: UsersService,
    private readonly courses: CoursesService,
  ) {}

  async update(
    principal: AuthenticatedUser,
    classId: string,
    unitId: string,
    input: UpdateClassUnitReleaseDto,
  ): Promise<MentorContentUnitDto> {
    // Keep actor → Class → Unit order, compatible with content authoring.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.transaction((manager) =>
          this.apply(manager, principal, classId, unitId, input),
        );
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
        if (attempt >= 2 || (code !== '40P01' && code !== '40001')) throw error;
      }
    }
  }

  private async apply(
    manager: EntityManager,
    principal: AuthenticatedUser,
    classId: string,
    unitId: string,
    input: UpdateClassUnitReleaseDto,
  ): Promise<MentorContentUnitDto> {
    const actor = await this.users.findActiveByRole(
      principal.userId,
      principal.role,
      manager,
      true,
    );
    if (!actor || (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MENTOR)) this.deny();
    const classRow = await manager
      .getRepository(ClassEntity)
      .findOne({ where: { id: classId }, lock: { mode: 'pessimistic_write' } });
    if (!classRow) throw new ClassNotFoundException();
    if (actor.role === UserRole.MENTOR && classRow.mentorId !== actor.id) this.deny();
    const units = manager.getRepository(ClassUnitEntity);
    const unit = await units.findOne({
      where: { id: unitId, classId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!unit) throw new ClassUnitNotFoundException();
    if (unit.status === ClassUnitStatus.COMPLETED || classRow.status === ClassStatus.CANCELLED)
      throw new UnitReleaseConflictException();
    const template = (await this.courses.findUnitsByIds([unit.courseUnitId], manager)).get(
      unit.courseUnitId,
    );
    if (!template || template.courseId !== classRow.courseId)
      throw new ClassUnitNotFoundException();
    const unlockAt =
      input.unlockAt === undefined
        ? unit.unlockAt
        : input.unlockAt === null
          ? null
          : new Date(input.unlockAt);
    if (
      (input.status !== ClassUnitStatus.OPEN && input.status !== ClassUnitStatus.LOCKED) ||
      (unlockAt !== null && !Number.isFinite(unlockAt.getTime()))
    )
      throw new AppHttpException(422, 'VALIDATION_ERROR', 'Invalid unit release values');
    if (unit.status !== input.status || unit.unlockAt?.getTime() !== unlockAt?.getTime()) {
      const audit = manager.getRepository(ClassUnitReleaseAuditEntity);
      const event = audit.create({
        actorId: actor.id,
        classId,
        classUnitId: unitId,
        beforeStatus: unit.status,
        afterStatus: input.status,
        beforeUnlockAt: unit.unlockAt,
        afterUnlockAt: unlockAt,
        occurredAt: new Date(),
      });
      unit.status = input.status;
      unit.unlockAt = unlockAt;
      await units.save(unit);
      await audit.save(event);
    }
    return {
      id: unit.id,
      classId: unit.classId,
      courseUnitId: unit.courseUnitId,
      title: template.title,
      position: unit.position,
      status: unit.status,
      unlockAt: unit.unlockAt,
    };
  }

  private deny(): never {
    throw new AppHttpException(
      403,
      'MATERIAL_ACCESS_DENIED',
      'The unit release action is not allowed in its current context',
    );
  }
}
