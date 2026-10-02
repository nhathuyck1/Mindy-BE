import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { AddCourseUnitDto } from '../dtos/add-course-unit.dto.js';
import {
  CourseManagementDetailDto,
  CourseManagementDto,
  CourseManagementPageDto,
  CourseUnitDto,
} from '../dtos/course.dto.js';
import { CourseCategoryDto } from '../dtos/course-category.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { AdminCoursePageOptionsDto } from '../dtos/course-page-options.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { CreateCourseDto } from '../dtos/create-course.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { CreateCourseCategoryDto } from '../dtos/create-course-category.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { ReorderCourseUnitsDto } from '../dtos/reorder-course-units.dto.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { UpdateCourseDto } from '../dtos/update-course.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { CourseCategoriesService } from '../services/course-categories.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { CoursesService } from '../services/courses.service.js';

@ApiTags('admin-catalog')
@Controller('admin')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiCookieAuth('access_token')
@ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
export class AdminCatalogController {
  constructor(
    private readonly categoriesService: CourseCategoriesService,
    private readonly coursesService: CoursesService,
  ) {}

  @Post('course-categories')
  @ApiOperation({ summary: 'Create a course category' })
  @ApiCreatedResponse({ type: CourseCategoryDto })
  @ApiErrors(HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async createCategory(@Body() dto: CreateCourseCategoryDto): Promise<CourseCategoryDto> {
    return new CourseCategoryDto(await this.categoriesService.create(dto));
  }

  @Get('courses')
  @ApiOperation({ summary: 'List courses for management, including inactive ones' })
  @ApiOkResponse({ type: CourseManagementPageDto })
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY)
  async listCourses(@Query() options: AdminCoursePageOptionsDto): Promise<CourseManagementPageDto> {
    const result = await this.coursesService.listForManagement(options);
    return new CourseManagementPageDto(
      result.items.map((item) => new CourseManagementDto(item.course, item.category)),
      options.page,
      options.pageSize,
      result.total,
    );
  }

  @Get('courses/:courseId')
  @ApiOperation({ summary: 'Get a course with its units for management' })
  @ApiOkResponse({ type: CourseManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND)
  async getCourse(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ): Promise<CourseManagementDetailDto> {
    const detail = await this.coursesService.getManagementDetail(courseId);
    return new CourseManagementDetailDto(detail.course, detail.category, detail.units);
  }

  @Post('courses')
  @ApiOperation({ summary: 'Create an inactive course' })
  @ApiCreatedResponse({ type: CourseManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async createCourse(@Body() dto: CreateCourseDto): Promise<CourseManagementDetailDto> {
    const detail = await this.coursesService.create(dto);
    return new CourseManagementDetailDto(detail.course, detail.category, detail.units);
  }

  @Patch('courses/:courseId')
  @ApiOperation({ summary: 'Update course fields; a new price applies to future checkouts only' })
  @ApiOkResponse({ type: CourseManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async updateCourse(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() dto: UpdateCourseDto,
  ): Promise<CourseManagementDetailDto> {
    const detail = await this.coursesService.update(courseId, dto);
    return new CourseManagementDetailDto(detail.course, detail.category, detail.units);
  }

  @Post('courses/:courseId/units')
  @ApiOperation({ summary: 'Append a unit to a course' })
  @ApiCreatedResponse({ type: CourseUnitDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.UNPROCESSABLE_ENTITY)
  async addUnit(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() dto: AddCourseUnitDto,
  ): Promise<CourseUnitDto> {
    return new CourseUnitDto(await this.coursesService.addUnit(courseId, dto));
  }

  @Put('courses/:courseId/units/order')
  @ApiOperation({ summary: 'Reorder the units of a course; existing classes are not changed' })
  @ApiOkResponse({ type: CourseManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT, HttpStatus.UNPROCESSABLE_ENTITY)
  async reorderUnits(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() dto: ReorderCourseUnitsDto,
  ): Promise<CourseManagementDetailDto> {
    const detail = await this.coursesService.reorderUnits(courseId, dto.unitIds);
    return new CourseManagementDetailDto(detail.course, detail.category, detail.units);
  }

  @Post('courses/:courseId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a course that has an active category and at least one unit' })
  @ApiOkResponse({ type: CourseManagementDetailDto })
  @ApiErrors(HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async activateCourse(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ): Promise<CourseManagementDetailDto> {
    const detail = await this.coursesService.activate(courseId);
    return new CourseManagementDetailDto(detail.course, detail.category, detail.units);
  }
}
