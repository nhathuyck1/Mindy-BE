import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import { CourseDto, CoursePageDto } from '../../catalog/dtos/course.dto.js';
import { ClassDetailDto, ClassDto, ClassPageDto } from '../../classes/dtos/class.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import {
  OpenClassPageOptionsDto,
  PublicCoursePageOptionsDto,
} from '../dtos/course-browse-options.dto.js';
import { PublicCourseDetailDto } from '../dtos/public-course-detail.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { CourseBrowseService } from '../services/course-browse.service.js';

/** Public endpoints: no authentication required and no meeting URLs in any response. */
@ApiTags('catalog')
@Controller()
export class CourseBrowseController {
  constructor(private readonly browseService: CourseBrowseService) {}

  @Get('courses')
  @ApiOperation({
    summary: 'List active courses, optionally only those with matching open classes',
  })
  @ApiOkResponse({ type: CoursePageDto })
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY)
  async listCourses(@Query() options: PublicCoursePageOptionsDto): Promise<CoursePageDto> {
    const result = await this.browseService.listCourses(options);
    return new CoursePageDto(
      result.items.map((item) => new CourseDto(item.course, item.category)),
      options.page,
      options.pageSize,
      result.total,
    );
  }

  @Get('courses/:courseId')
  @ApiOperation({ summary: 'Get an active course with its unit summary and open classes' })
  @ApiOkResponse({ type: PublicCourseDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND)
  async getCourse(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ): Promise<PublicCourseDetailDto> {
    const result = await this.browseService.getCourse(courseId);
    return new PublicCourseDetailDto(result.detail, result.openClasses);
  }

  @Get('courses/:courseId/classes')
  @ApiOperation({ summary: 'List the open classes of an active course' })
  @ApiOkResponse({ type: ClassPageDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.UNPROCESSABLE_ENTITY)
  async listCourseClasses(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Query() options: OpenClassPageOptionsDto,
  ): Promise<ClassPageDto> {
    const result = await this.browseService.listCourseClasses(courseId, options);
    return new ClassPageDto(
      result.items.map((view) => new ClassDto(view)),
      options.page,
      options.pageSize,
      result.total,
    );
  }

  @Get('classes/:classId')
  @ApiOperation({ summary: 'Get an open class with its units and timetable' })
  @ApiOkResponse({ type: ClassDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND)
  async getClass(@Param('classId', new ParseUUIDPipe()) classId: string): Promise<ClassDetailDto> {
    return new ClassDetailDto(await this.browseService.getClass(classId));
  }
}
