import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TrustedOriginGuard } from '../../../common/http/trusted-origin.guard.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import {
  CourseManagementDetailDto,
  CourseManagementDto,
  CourseManagementPageDto,
  CourseUnitDto,
} from '../dtos/course.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO validation metadata.
import { AdminCoursePageOptionsDto } from '../dtos/course-page-options.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO validation metadata.
import { UpdateCourseUnitDto } from '../dtos/update-course-unit.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { CoursesService } from '../services/courses.service.js';

@ApiTags('manager catalog')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MANAGER)
@ApiErrors(400, 401, 403, 404, 422)
@Controller('manager/courses')
export class ManagerCatalogController {
  constructor(private readonly courses: CoursesService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: CourseManagementPageDto })
  async list(@Query() query: AdminCoursePageOptionsDto): Promise<CourseManagementPageDto> {
    const result = await this.courses.listForManagement(query);
    return new CourseManagementPageDto(
      result.items.map((row) => new CourseManagementDto(row.course, row.category)),
      query.page,
      query.pageSize,
      result.total,
    );
  }
  @Get(':courseId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: CourseManagementDetailDto })
  async detail(
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
  ): Promise<CourseManagementDetailDto> {
    const result = await this.courses.getManagementDetail(courseId);
    return new CourseManagementDetailDto(result.course, result.category, result.units);
  }
  @Patch(':courseId/units/:unitId')
  @UseGuards(TrustedOriginGuard)
  @ApiOkResponse({ type: CourseUnitDto })
  async updateUnit(
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
    @Param('unitId', new ParseUUIDPipe({ version: '4' })) unitId: string,
    @Body() input: UpdateCourseUnitDto,
  ): Promise<CourseUnitDto> {
    return new CourseUnitDto(await this.courses.updateUnit(courseId, unitId, input));
  }
}
