import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager, In } from 'typeorm';

import { isUniqueViolation } from '../../../common/database/postgres-error.js';
import { normalizeCode, normalizeOptionalText } from '../../../common/text/normalize-text.js';
import type { AddCourseUnitDto } from '../dtos/add-course-unit.dto.js';
import type { AdminCoursePageOptionsDto } from '../dtos/course-page-options.dto.js';
import type { CreateCourseDto } from '../dtos/create-course.dto.js';
import type { UpdateCourseDto } from '../dtos/update-course.dto.js';
import { CourseEntity } from '../entities/course.entity.js';
import { CourseCategoryEntity } from '../entities/course-category.entity.js';
import { CourseUnitEntity } from '../entities/course-unit.entity.js';
import {
  CourseCategoryInactiveException,
  CourseCategoryNotFoundException,
  CourseCodeAlreadyExistsException,
  CourseHasNoUnitsException,
  CourseNotFoundException,
  CourseUnitOrderMismatchException,
} from '../exceptions/catalog.exceptions.js';

const DEFAULT_REQUIRED_SCORE_PERCENT = 80;

export interface CourseWithCategory {
  readonly course: CourseEntity;
  readonly category: CourseCategoryEntity;
}

export interface CourseDetail extends CourseWithCategory {
  readonly units: CourseUnitEntity[];
}

export interface CourseTemplate {
  readonly course: CourseEntity;
  readonly units: CourseUnitEntity[];
}

export interface ActiveCourseFilter {
  readonly categoryId?: string;
  /** When set, only these courses are eligible; an empty list yields an empty page. */
  readonly courseIds?: readonly string[];
  readonly page: number;
  readonly pageSize: number;
}

@Injectable()
export class CoursesService {
  constructor(private readonly dataSource: DataSource) {}

  async create(input: CreateCourseDto): Promise<CourseDetail> {
    const code = normalizeCode(input.code);
    const courses = this.dataSource.getRepository(CourseEntity);
    const category = await this.getActiveCategory(this.dataSource.manager, input.categoryId);
    if (await courses.exists({ where: { code } })) {
      throw new CourseCodeAlreadyExistsException();
    }

    try {
      const course = await courses.save(
        courses.create({
          categoryId: category.id,
          code,
          title: input.title.trim(),
          description: normalizeOptionalText(input.description),
          priceAmount: input.priceAmount,
          isActive: false,
        }),
      );
      return { course, category, units: [] };
    } catch (error: unknown) {
      if (isUniqueViolation(error, 'uq_courses_code')) {
        throw new CourseCodeAlreadyExistsException();
      }

      throw error;
    }
  }

  async update(courseId: string, input: UpdateCourseDto): Promise<CourseDetail> {
    return this.dataSource.transaction(async (manager) => {
      const course = await this.lockCourse(manager, courseId);
      if (input.categoryId !== undefined && input.categoryId !== course.categoryId) {
        course.categoryId = (await this.getActiveCategory(manager, input.categoryId)).id;
      }
      if (input.title !== undefined) {
        course.title = input.title.trim();
      }
      if (input.description !== undefined) {
        course.description = normalizeOptionalText(input.description);
      }
      if (input.priceAmount !== undefined) {
        course.priceAmount = input.priceAmount;
      }

      await manager.getRepository(CourseEntity).save(course);
      return this.loadDetail(manager, course);
    });
  }

  async addUnit(courseId: string, input: AddCourseUnitDto): Promise<CourseUnitEntity> {
    return this.dataSource.transaction(async (manager) => {
      // The course row lock serializes concurrent appends and reorders of the same course.
      await this.lockCourse(manager, courseId);
      const units = manager.getRepository(CourseUnitEntity);
      const last = await units.findOne({ where: { courseId }, order: { unitNumber: 'DESC' } });

      return units.save(
        units.create({
          courseId,
          unitNumber: (last?.unitNumber ?? 0) + 1,
          title: input.title.trim(),
          description: normalizeOptionalText(input.description),
          requiredScorePercent: input.requiredScorePercent ?? DEFAULT_REQUIRED_SCORE_PERCENT,
        }),
      );
    });
  }

  async reorderUnits(courseId: string, unitIds: readonly string[]): Promise<CourseDetail> {
    return this.dataSource.transaction(async (manager) => {
      const course = await this.lockCourse(manager, courseId);
      const existing = await manager.getRepository(CourseUnitEntity).find({ where: { courseId } });
      const existingIds = new Set(existing.map((unit) => unit.id));
      if (existing.length !== unitIds.length || unitIds.some((id) => !existingIds.has(id))) {
        throw new CourseUnitOrderMismatchException();
      }

      // One statement renumbers every unit; the deferrable unique constraint is checked at its
      // end. Class units keep their own position, so existing classes are not affected.
      await manager.query(
        `UPDATE "course_units" AS unit
         SET "unit_number" = ordered.unit_number, "updated_at" = now()
         FROM unnest($1::uuid[]) WITH ORDINALITY AS ordered(id, unit_number)
         WHERE unit.id = ordered.id AND unit.course_id = $2`,
        [unitIds, courseId],
      );
      return this.loadDetail(manager, course);
    });
  }

  async activate(courseId: string): Promise<CourseDetail> {
    return this.dataSource.transaction(async (manager) => {
      const course = await this.lockCourse(manager, courseId);
      await this.getActiveCategory(manager, course.categoryId);
      const unitCount = await manager
        .getRepository(CourseUnitEntity)
        .count({ where: { courseId } });
      if (unitCount === 0) {
        throw new CourseHasNoUnitsException();
      }

      if (!course.isActive) {
        course.isActive = true;
        await manager.getRepository(CourseEntity).save(course);
      }
      return this.loadDetail(manager, course);
    });
  }

  async listForManagement(
    options: AdminCoursePageOptionsDto,
  ): Promise<{ items: CourseWithCategory[]; total: number }> {
    const query = this.dataSource
      .getRepository(CourseEntity)
      .createQueryBuilder('course')
      .orderBy('course.createdAt', 'DESC')
      .addOrderBy('course.id', 'ASC');
    if (options.categoryId !== undefined) {
      query.andWhere('course.categoryId = :categoryId', { categoryId: options.categoryId });
    }
    if (options.isActive !== undefined) {
      query.andWhere('course.isActive = :isActive', { isActive: options.isActive });
    }

    const [courses, total] = await query
      .skip((options.page - 1) * options.pageSize)
      .take(options.pageSize)
      .getManyAndCount();
    return { items: await this.attachCategories(this.dataSource.manager, courses), total };
  }

  async getManagementDetail(courseId: string): Promise<CourseDetail> {
    const course = await this.dataSource.getRepository(CourseEntity).findOne({
      where: { id: courseId },
    });
    if (course === null) {
      throw new CourseNotFoundException();
    }

    return this.loadDetail(this.dataSource.manager, course);
  }

  /** Public catalog: active courses whose category is active as well. */
  async listActive(
    filter: ActiveCourseFilter,
  ): Promise<{ items: CourseWithCategory[]; total: number }> {
    if (filter.courseIds !== undefined && filter.courseIds.length === 0) {
      return { items: [], total: 0 };
    }

    const query = this.dataSource
      .getRepository(CourseEntity)
      .createQueryBuilder('course')
      .innerJoin(
        CourseCategoryEntity,
        'category',
        'category.id = course.categoryId AND category.isActive = true',
      )
      .where('course.isActive = true')
      .orderBy('course.title', 'ASC')
      .addOrderBy('course.id', 'ASC');
    if (filter.categoryId !== undefined) {
      query.andWhere('course.categoryId = :categoryId', { categoryId: filter.categoryId });
    }
    if (filter.courseIds !== undefined) {
      query.andWhere('course.id IN (:...courseIds)', { courseIds: filter.courseIds });
    }

    const [courses, total] = await query
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize)
      .getManyAndCount();
    return { items: await this.attachCategories(this.dataSource.manager, courses), total };
  }

  async getActiveDetail(courseId: string): Promise<CourseDetail> {
    const course = await this.dataSource.getRepository(CourseEntity).findOne({
      where: { id: courseId, isActive: true },
    });
    if (course === null) {
      throw new CourseNotFoundException();
    }

    const detail = await this.loadDetail(this.dataSource.manager, course);
    if (!detail.category.isActive) {
      throw new CourseNotFoundException();
    }

    return detail;
  }

  /**
   * Reads the course and its ordered units for copying into a new class. The shared row lock
   * keeps a concurrent unit append or reorder from interleaving with the copy.
   */
  async getTemplate(manager: EntityManager, courseId: string): Promise<CourseTemplate> {
    const course = await manager
      .getRepository(CourseEntity)
      .createQueryBuilder('course')
      .setLock('pessimistic_read')
      .where('course.id = :courseId', { courseId })
      .getOne();
    if (course === null) {
      throw new CourseNotFoundException();
    }

    const units = await manager.getRepository(CourseUnitEntity).find({
      where: { courseId },
      order: { unitNumber: 'ASC' },
    });
    return { course, units };
  }

  async findByIds(
    courseIds: readonly string[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<string, CourseEntity>> {
    if (courseIds.length === 0) {
      return new Map();
    }

    const courses = await manager.getRepository(CourseEntity).findBy({ id: In([...courseIds]) });
    return new Map(courses.map((course) => [course.id, course]));
  }

  async findUnitsByIds(
    unitIds: readonly string[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<string, CourseUnitEntity>> {
    if (unitIds.length === 0) {
      return new Map();
    }

    const units = await manager.getRepository(CourseUnitEntity).findBy({ id: In([...unitIds]) });
    return new Map(units.map((unit) => [unit.id, unit]));
  }

  private async lockCourse(manager: EntityManager, courseId: string): Promise<CourseEntity> {
    const course = await manager
      .getRepository(CourseEntity)
      .createQueryBuilder('course')
      .setLock('pessimistic_write')
      .where('course.id = :courseId', { courseId })
      .getOne();
    if (course === null) {
      throw new CourseNotFoundException();
    }

    return course;
  }

  private async getActiveCategory(
    manager: EntityManager,
    categoryId: string,
  ): Promise<CourseCategoryEntity> {
    const category = await manager.getRepository(CourseCategoryEntity).findOne({
      where: { id: categoryId },
    });
    if (category === null) {
      throw new CourseCategoryNotFoundException();
    }
    if (!category.isActive) {
      throw new CourseCategoryInactiveException();
    }

    return category;
  }

  private async loadDetail(manager: EntityManager, course: CourseEntity): Promise<CourseDetail> {
    const [withCategory] = await this.attachCategories(manager, [course]);
    if (withCategory === undefined) {
      throw new CourseCategoryNotFoundException();
    }

    const units = await manager.getRepository(CourseUnitEntity).find({
      where: { courseId: course.id },
      order: { unitNumber: 'ASC' },
    });
    return { ...withCategory, units };
  }

  private async attachCategories(
    manager: EntityManager,
    courses: readonly CourseEntity[],
  ): Promise<CourseWithCategory[]> {
    if (courses.length === 0) {
      return [];
    }

    const categoryIds = [...new Set(courses.map((course) => course.categoryId))];
    const categories = await manager
      .getRepository(CourseCategoryEntity)
      .findBy({ id: In(categoryIds) });
    const categoriesById = new Map(categories.map((category) => [category.id, category]));

    return courses.flatMap((course) => {
      const category = categoriesById.get(course.categoryId);
      return category === undefined ? [] : [{ course, category }];
    });
  }
}
