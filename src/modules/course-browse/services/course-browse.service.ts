import { Injectable } from '@nestjs/common';
import type { CourseDetail, CourseWithCategory } from '../../catalog/services/courses.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { CoursesService } from '../../catalog/services/courses.service.js';
import type { ClassDetailView, ClassView } from '../../classes/domain/class-views.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassReadService } from '../../classes/services/class-read.service.js';
import type {
  OpenClassPageOptionsDto,
  PublicCoursePageOptionsDto,
} from '../dtos/course-browse-options.dto.js';

const COURSE_DETAIL_OPEN_CLASS_LIMIT = 20;

/**
 * Public, unauthenticated browsing. Composes the catalog (active courses) with the classes
 * module (open classes); it owns no tables.
 */
@Injectable()
export class CourseBrowseService {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly classReadService: ClassReadService,
  ) {}

  async listCourses(
    options: PublicCoursePageOptionsDto,
  ): Promise<{ items: CourseWithCategory[]; total: number }> {
    const filtersByClass =
      options.deliveryMode !== undefined ||
      options.startsFrom !== undefined ||
      options.startsTo !== undefined;
    const courseIds = filtersByClass
      ? await this.classReadService.findCourseIdsWithOpenClasses(options)
      : undefined;

    return this.coursesService.listActive({
      categoryId: options.categoryId,
      courseIds,
      page: options.page,
      pageSize: options.pageSize,
    });
  }

  async getCourse(courseId: string): Promise<{ detail: CourseDetail; openClasses: ClassView[] }> {
    const detail = await this.coursesService.getActiveDetail(courseId);
    const openClasses = await this.classReadService.listOpen(
      { courseId },
      { page: 1, pageSize: COURSE_DETAIL_OPEN_CLASS_LIMIT },
    );

    return { detail, openClasses: openClasses.items };
  }

  async listCourseClasses(
    courseId: string,
    options: OpenClassPageOptionsDto,
  ): Promise<{ items: ClassView[]; total: number }> {
    await this.coursesService.getActiveDetail(courseId);
    return this.classReadService.listOpen(
      {
        courseId,
        deliveryMode: options.deliveryMode,
        startsFrom: options.startsFrom,
        startsTo: options.startsTo,
      },
      options,
    );
  }

  async getClass(classId: string): Promise<ClassDetailView> {
    return this.classReadService.getOpenDetail(classId);
  }
}
