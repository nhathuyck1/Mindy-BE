import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager, In, type SelectQueryBuilder } from 'typeorm';

// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { CoursesService } from '../../catalog/services/courses.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import { toLocalDate } from '../domain/class-calendar.js';
import { isClassOpenForPurchase } from '../domain/class-lifecycle.js';
import type { ClassDetailView, ClassView } from '../domain/class-views.js';
import type { AdminClassPageOptionsDto } from '../dtos/class-page-options.dto.js';
import { ClassEntity } from '../entities/class.entity.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import type { DeliveryMode } from '../enums/delivery-mode.enum.js';
import { ClassNotFoundException } from '../exceptions/class.exceptions.js';

export interface OpenClassFilter {
  readonly courseId?: string;
  readonly deliveryMode?: DeliveryMode;
  /** Class start date range, as `YYYY-MM-DD` calendar dates. */
  readonly startsFrom?: string;
  readonly startsTo?: string;
}

export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

/** Read side of the classes module: views for management screens and public browsing. */
@Injectable()
export class ClassReadService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly coursesService: CoursesService,
    private readonly usersService: UsersService,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  timeZone(): string {
    return this.config.getOrThrow<string>('APP_TIME_ZONE');
  }

  /** Today's calendar date at the center. */
  today(now: Date = new Date()): string {
    return toLocalDate(now, this.timeZone());
  }

  async listForManagement(
    options: AdminClassPageOptionsDto,
  ): Promise<{ items: ClassView[]; total: number }> {
    const query = this.dataSource
      .getRepository(ClassEntity)
      .createQueryBuilder('class')
      .orderBy('class.createdAt', 'DESC')
      .addOrderBy('class.id', 'ASC');
    if (options.courseId !== undefined) {
      query.andWhere('class.courseId = :courseId', { courseId: options.courseId });
    }
    if (options.mentorId !== undefined) {
      query.andWhere('class.mentorId = :mentorId', { mentorId: options.mentorId });
    }
    if (options.status !== undefined) {
      query.andWhere('class.status = :status', { status: options.status });
    }
    if (options.deliveryMode !== undefined) {
      query.andWhere('class.deliveryMode = :deliveryMode', { deliveryMode: options.deliveryMode });
    }

    const [classes, total] = await query
      .skip((options.page - 1) * options.pageSize)
      .take(options.pageSize)
      .getManyAndCount();
    return { items: await this.toViews(classes), total };
  }

  /** Classes that can be purchased now: OPEN and not past their end date. */
  async listOpen(
    filter: OpenClassFilter,
    page: PageRequest,
  ): Promise<{ items: ClassView[]; total: number }> {
    const [classes, total] = await this.openClassesQuery(filter)
      .skip((page.page - 1) * page.pageSize)
      .take(page.pageSize)
      .getManyAndCount();
    return { items: await this.toViews(classes), total };
  }

  async findCourseIdsWithOpenClasses(filter: OpenClassFilter): Promise<string[]> {
    const rows = await this.openClassesQuery(filter)
      .select('class.courseId', 'courseId')
      .distinct(true)
      .orderBy()
      .getRawMany<{ courseId: string }>();
    return rows.map((row) => row.courseId);
  }

  async getDetail(classId: string): Promise<ClassDetailView> {
    const classEntity = await this.dataSource.getRepository(ClassEntity).findOne({
      where: { id: classId },
    });
    if (classEntity === null) {
      throw new ClassNotFoundException();
    }

    return this.loadDetail(this.dataSource.manager, classEntity);
  }

  /** A class is public only while it can be purchased; anything else reads as not found. */
  async getOpenDetail(classId: string): Promise<ClassDetailView> {
    const detail = await this.getDetail(classId);
    if (!isClassOpenForPurchase(detail.classEntity, this.today())) {
      throw new ClassNotFoundException();
    }

    const courses = await this.coursesService.findByIds([detail.classEntity.courseId]);
    if (courses.get(detail.classEntity.courseId)?.isActive !== true) {
      throw new ClassNotFoundException();
    }

    return detail;
  }

  async loadDetail(manager: EntityManager, classEntity: ClassEntity): Promise<ClassDetailView> {
    const units = await manager.getRepository(ClassUnitEntity).find({
      where: { classId: classEntity.id },
      order: { position: 'ASC' },
    });
    const sessions =
      units.length === 0
        ? []
        : await manager.getRepository(ClassSessionEntity).find({
            where: { classUnitId: In(units.map((unit) => unit.id)) },
            order: { startsAt: 'ASC', sessionNumber: 'ASC' },
          });
    const courseUnits = await this.coursesService.findUnitsByIds(
      units.map((unit) => unit.courseUnitId),
      manager,
    );
    const [view] = await this.toViews([classEntity], manager);
    if (view === undefined) {
      throw new ClassNotFoundException();
    }

    return {
      ...view,
      units: units.map((unit) => ({
        unit,
        title: courseUnits.get(unit.courseUnitId)?.title ?? '',
        sessions: sessions.filter((session) => session.classUnitId === unit.id),
      })),
    };
  }

  /** Adds mentor names and seat usage to classes with one query each. */
  async toViews(
    classes: readonly ClassEntity[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ClassView[]> {
    if (classes.length === 0) {
      return [];
    }

    const mentors = await this.usersService.findByIds([
      ...new Set(classes.map((classEntity) => classEntity.mentorId)),
    ]);
    const mentorNames = new Map(mentors.map((mentor) => [mentor.id, mentor.displayName]));
    const occupied = await this.enrollmentsService.countOccupiedSeats(
      classes.map((classEntity) => classEntity.id),
      manager,
    );

    return classes.map((classEntity) => ({
      classEntity,
      mentorName: mentorNames.get(classEntity.mentorId) ?? null,
      occupiedSeats: occupied.get(classEntity.id) ?? 0,
    }));
  }

  private openClassesQuery(filter: OpenClassFilter): SelectQueryBuilder<ClassEntity> {
    const query = this.dataSource
      .getRepository(ClassEntity)
      .createQueryBuilder('class')
      .where('class.status = :status', { status: ClassStatus.OPEN })
      .andWhere('class.endDate >= :today', { today: this.today() })
      .orderBy('class.startDate', 'ASC')
      .addOrderBy('class.id', 'ASC');
    if (filter.courseId !== undefined) {
      query.andWhere('class.courseId = :courseId', { courseId: filter.courseId });
    }
    if (filter.deliveryMode !== undefined) {
      query.andWhere('class.deliveryMode = :deliveryMode', { deliveryMode: filter.deliveryMode });
    }
    if (filter.startsFrom !== undefined) {
      query.andWhere('class.startDate >= :startsFrom', { startsFrom: filter.startsFrom });
    }
    if (filter.startsTo !== undefined) {
      query.andWhere('class.startDate <= :startsTo', { startsTo: filter.startsTo });
    }

    return query;
  }
}
