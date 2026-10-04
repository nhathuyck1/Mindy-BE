import { ApiProperty } from '@nestjs/swagger';

import { CourseDto, CourseUnitDto } from '../../catalog/dtos/course.dto.js';
import type { CourseDetail } from '../../catalog/services/courses.service.js';
import type { ClassView } from '../../classes/domain/class-views.js';
import { ClassDto } from '../../classes/dtos/class.dto.js';

/** Public course page: unit summary plus the first open classes that can be purchased. */
export class PublicCourseDetailDto extends CourseDto {
  @ApiProperty({ type: () => CourseUnitDto, isArray: true })
  readonly units: CourseUnitDto[];

  @ApiProperty({
    type: () => ClassDto,
    isArray: true,
    description: 'Earliest open classes; page through GET /courses/{courseId}/classes for more',
  })
  readonly openClasses: ClassDto[];

  constructor(detail: CourseDetail, openClasses: readonly ClassView[]) {
    super(detail.course, detail.category);
    this.units = detail.units.map((unit) => new CourseUnitDto(unit));
    this.openClasses = openClasses.map((view) => new ClassDto(view));
  }
}
