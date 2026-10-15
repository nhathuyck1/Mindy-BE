import { HttpStatus, Injectable, UnprocessableEntityException } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager } from 'typeorm';

import { isUniqueViolation } from '../../../common/database/postgres-error.js';
import { normalizeCode, normalizeOptionalText } from '../../../common/text/normalize-text.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { CoursesService } from '../../catalog/services/courses.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import { assertClassTransition } from '../domain/class-lifecycle.js';
import type { ClassDetailView } from '../domain/class-views.js';
import type { CreateClassDto } from '../dtos/create-class.dto.js';
import type { ScheduleClassSessionDto } from '../dtos/schedule-class-session.dto.js';
import type { UpdateClassDto } from '../dtos/update-class.dto.js';
import type { UpdateClassSessionTimeDto } from '../dtos/update-class-session-time.dto.js';
import { ClassEntity } from '../entities/class.entity.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { ClassUnitStatus } from '../enums/class-unit-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';
import {
  ClassCodeAlreadyExistsException,
  ClassCourseInactiveException,
  ClassDateRangeInvalidException,
  ClassMentorNotEligibleException,
  ClassNotEditableException,
  ClassNotFoundException,
} from '../exceptions/class.exceptions.js';
import { TeachingConflictException } from '../exceptions/teaching.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassReadService } from './class-read.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassScheduleService } from './class-schedule.service.js';

/** Fields that are frozen once a class leaves DRAFT. */
const DRAFT_ONLY_FIELDS = ['startDate', 'endDate', 'maxStudents', 'deliveryMode'] as const;

/** Management commands of a class: creation, edits, scheduling and lifecycle transitions. */
@Injectable()
export class ClassesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly coursesService: CoursesService,
    private readonly usersService: UsersService,
    private readonly scheduleService: ClassScheduleService,
    private readonly readService: ClassReadService,
  ) {}

  /** Creates a DRAFT class and copies the course's current units into it atomically. */
  async create(input: CreateClassDto): Promise<ClassDetailView> {
    if (input.startDate > input.endDate) {
      throw new ClassDateRangeInvalidException();
    }
    await this.assertMentorEligible(input.mentorId, HttpStatus.UNPROCESSABLE_ENTITY);
    const code = normalizeCode(input.code);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const template = await this.coursesService.getTemplate(manager, input.courseId);
        if (!template.course.isActive) {
          throw new ClassCourseInactiveException();
        }

        const classes = manager.getRepository(ClassEntity);
        if (await classes.exists({ where: { code } })) {
          throw new ClassCodeAlreadyExistsException();
        }

        const classEntity = await classes.save(
          classes.create({
            courseId: template.course.id,
            mentorId: input.mentorId,
            code,
            name: input.name.trim(),
            startDate: input.startDate,
            endDate: input.endDate,
            maxStudents: input.maxStudents,
            deliveryMode: input.deliveryMode,
            meetingUrl: normalizeOptionalText(input.meetingUrl),
            status: ClassStatus.DRAFT,
          }),
        );
        const units = manager.getRepository(ClassUnitEntity);
        await units.save(
          template.units.map((courseUnit, index) =>
            units.create({
              classId: classEntity.id,
              courseUnitId: courseUnit.id,
              position: index + 1,
              unlockAt: null,
              status: ClassUnitStatus.LOCKED,
            }),
          ),
        );
        return this.readService.loadDetail(manager, classEntity);
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error, 'uq_classes_code')) {
        throw new ClassCodeAlreadyExistsException();
      }

      throw error;
    }
  }

  async update(classId: string, input: UpdateClassDto): Promise<ClassDetailView> {
    if (input.mentorId !== undefined) {
      throw new UnprocessableEntityException(
        'Mentor changes must use the audited assignment command',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const classEntity = await this.lockClass(manager, classId);
      this.assertEditable(classEntity);
      if (classEntity.status !== ClassStatus.DRAFT) {
        const frozen = DRAFT_ONLY_FIELDS.filter((field) => input[field] !== undefined);
        if (frozen.length > 0) {
          throw new ClassNotEditableException(classEntity.status, frozen);
        }
      }

      if (input.name !== undefined) {
        classEntity.name = input.name.trim();
      }
      if (input.meetingUrl !== undefined) {
        classEntity.meetingUrl = normalizeOptionalText(input.meetingUrl);
      }
      classEntity.startDate = input.startDate ?? classEntity.startDate;
      classEntity.endDate = input.endDate ?? classEntity.endDate;
      classEntity.maxStudents = input.maxStudents ?? classEntity.maxStudents;
      classEntity.deliveryMode = input.deliveryMode ?? classEntity.deliveryMode;
      if (classEntity.startDate > classEntity.endDate) {
        throw new ClassDateRangeInvalidException();
      }

      await manager.getRepository(ClassEntity).save(classEntity);
      return this.readService.loadDetail(manager, classEntity);
    });
  }

  async scheduleSession(classId: string, input: ScheduleClassSessionDto): Promise<ClassDetailView> {
    return this.dataSource.transaction(async (manager) => {
      // The class row lock serializes session numbering and overlap checks for this class.
      const classEntity = await this.lockClass(manager, classId);
      this.assertEditable(classEntity);
      await this.scheduleService.addSession(manager, classEntity, input);
      classEntity.assignmentVersion += 1;
      await manager.getRepository(ClassEntity).save(classEntity);
      return this.readService.loadDetail(manager, classEntity);
    });
  }

  async updateSessionTimes(
    classId: string,
    sessionIds: readonly string[],
    input: UpdateClassSessionTimeDto,
  ): Promise<ClassDetailView> {
    return this.dataSource.transaction(async (manager) => {
      const classEntity = await this.lockClass(manager, classId);
      this.assertEditable(classEntity);
      await this.scheduleService.updateSessionTimes(manager, classEntity, sessionIds, input);
      classEntity.assignmentVersion += 1;
      await manager.getRepository(ClassEntity).save(classEntity);
      return this.readService.loadDetail(manager, classEntity);
    });
  }

  /** DRAFT -> OPEN: the class becomes visible and purchasable. */
  async open(classId: string): Promise<ClassDetailView> {
    return this.transition(classId, ClassStatus.OPEN, async (manager, classEntity) => {
      const courses = await this.coursesService.findByIds([classEntity.courseId], manager);
      if (courses.get(classEntity.courseId)?.isActive !== true) {
        throw new ClassCourseInactiveException();
      }
      await this.assertMentorEligible(classEntity.mentorId, HttpStatus.CONFLICT);
      const sessions = await manager
        .getRepository(ClassSessionEntity)
        .createQueryBuilder('session')
        .innerJoin(ClassUnitEntity, 'unit', 'unit.id = session.classUnitId')
        .where('unit.classId = :id AND session.status = :status', {
          id: classId,
          status: SessionStatus.SCHEDULED,
        })
        .getMany();
      for (const mentorId of new Set(
        sessions.map((s) => s.mentorOverrideId ?? classEntity.mentorId),
      )) {
        if (!(await this.usersService.findActiveByRole(mentorId, UserRole.MENTOR, manager))) {
          throw new ClassMentorNotEligibleException(HttpStatus.CONFLICT);
        }
      }
      await this.scheduleService.assertReadyToOpen(manager, classEntity);
    });
  }

  /** OPEN -> IN_PROGRESS: registration closes. */
  async start(classId: string): Promise<ClassDetailView> {
    return this.transition(classId, ClassStatus.IN_PROGRESS);
  }

  /** IN_PROGRESS -> COMPLETED: the class becomes read-only history. */
  async complete(classId: string): Promise<ClassDetailView> {
    return this.transition(classId, ClassStatus.COMPLETED, async (manager) => {
      await this.scheduleService.assertMakeupsResolved(manager, classId);
      const unresolved: unknown[] = await manager.query(
        `SELECT 1 FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id
        WHERE u.class_id=$1 AND s.status::text IN ('SCHEDULED','IN_PROGRESS') LIMIT 1`,
        [classId],
      );
      if (unresolved.length)
        throw new TeachingConflictException(
          'SESSION_STATE_CONFLICT',
          'Finalize or cancel all outstanding sessions before completing the class',
        );
    });
  }

  async cancel(classId: string, actorId: string | null = null): Promise<ClassDetailView> {
    return this.transition(classId, ClassStatus.CANCELLED, async (manager, c) => {
      await this.scheduleService.cancelClassSessions(manager, c, actorId);
    });
  }

  private async transition(
    classId: string,
    target: ClassStatus,
    guard?: (manager: EntityManager, classEntity: ClassEntity) => Promise<void>,
  ): Promise<ClassDetailView> {
    return this.dataSource.transaction(async (manager) => {
      const classEntity = await this.lockClass(manager, classId);
      assertClassTransition(classEntity.status, target);
      await guard?.(manager, classEntity);

      classEntity.status = target;
      classEntity.assignmentVersion += 1;
      await manager
        .getRepository(ClassSessionEntity)
        .createQueryBuilder()
        .update()
        .set({ version: () => 'version + 1' })
        .where('class_unit_id IN (SELECT id FROM class_units WHERE class_id = :id)', {
          id: classId,
        })
        .andWhere('status = :status', { status: SessionStatus.SCHEDULED })
        .execute();
      await manager.getRepository(ClassEntity).save(classEntity);
      return this.readService.loadDetail(manager, classEntity);
    });
  }

  private async assertMentorEligible(
    mentorId: string,
    status: HttpStatus.UNPROCESSABLE_ENTITY | HttpStatus.CONFLICT,
  ): Promise<void> {
    const mentor = await this.usersService.findActiveByRole(mentorId, UserRole.MENTOR);
    if (mentor === null) {
      throw new ClassMentorNotEligibleException(status);
    }
  }

  private assertEditable(classEntity: ClassEntity): void {
    if (
      classEntity.status === ClassStatus.COMPLETED ||
      classEntity.status === ClassStatus.CANCELLED
    ) {
      throw new ClassNotEditableException(classEntity.status);
    }
  }

  private async lockClass(manager: EntityManager, classId: string): Promise<ClassEntity> {
    const classEntity = await manager
      .getRepository(ClassEntity)
      .createQueryBuilder('class')
      .setLock('pessimistic_write')
      .where('class.id = :classId', { classId })
      .getOne();
    if (classEntity === null) {
      throw new ClassNotFoundException();
    }

    return classEntity;
  }
}
