import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { DataSource, type EntityManager } from 'typeorm';

import type { ClassContentContext } from '../domain/class-content-context.js';
import { ClassEntity } from '../entities/class.entity.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import {
  ClassNotFoundException,
  ClassSessionNotFoundException,
  ClassUnitNotFoundException,
} from '../exceptions/class.exceptions.js';

/** Ancestry is resolved inside Classes; consumers do not read its private repositories. */
@Injectable()
export class ClassContentContextService {
  constructor(private readonly dataSource: DataSource) {}

  /** Public transaction lock; callers never reach into the Classes repository. */
  async lockContentClass(classId: string, manager: EntityManager): Promise<void> {
    const row = await manager
      .getRepository(ClassEntity)
      .createQueryBuilder('class')
      .setLock('pessimistic_write')
      .where('class.id = :classId', { classId })
      .getOne();
    if (row === null) throw new ClassNotFoundException();
  }

  async getUnit(
    classUnitId: string,
    expectedClassId?: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ClassContentContext> {
    const unit = await manager.getRepository(ClassUnitEntity).findOneBy({ id: classUnitId });
    if (unit === null || (expectedClassId !== undefined && unit.classId !== expectedClassId)) {
      throw new ClassUnitNotFoundException();
    }
    const classEntity = await manager.getRepository(ClassEntity).findOneBy({ id: unit.classId });
    if (classEntity === null) throw new ClassNotFoundException();
    return {
      classId: classEntity.id,
      courseId: classEntity.courseId,
      mentorId: classEntity.mentorId,
      classStatus: classEntity.status,
      classUnitId: unit.id,
      courseUnitId: unit.courseUnitId,
      unitStatus: unit.status,
      unlockAt: unit.unlockAt,
      sessionId: null,
      sessionStatus: null,
    };
  }

  async getCourseUnitInClass(
    classId: string,
    courseUnitId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ClassContentContext> {
    const unit = await manager.getRepository(ClassUnitEntity).findOneBy({ classId, courseUnitId });
    if (unit === null) throw new ClassUnitNotFoundException();
    return this.getUnit(unit.id, classId, manager);
  }

  async getSession(
    sessionId: string,
    expectedClassId?: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ClassContentContext> {
    const session = await manager.getRepository(ClassSessionEntity).findOneBy({ id: sessionId });
    if (session === null) throw new ClassSessionNotFoundException();
    const context = await this.getUnit(session.classUnitId, expectedClassId, manager);
    return { ...context, sessionId: session.id, sessionStatus: session.status };
  }
}
