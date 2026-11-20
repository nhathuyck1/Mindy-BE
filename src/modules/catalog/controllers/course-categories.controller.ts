import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import { CourseCategoryDto, CourseCategoryPageDto } from '../dtos/course-category.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { CourseCategoriesService } from '../services/course-categories.service.js';

/** Public endpoint: no authentication required. */
@ApiTags('catalog')
@Controller('course-categories')
export class CourseCategoriesController {
  constructor(private readonly categoriesService: CourseCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List active course categories' })
  @ApiOkResponse({ type: CourseCategoryPageDto })
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY)
  async list(@Query() options: PageOptionsDto): Promise<CourseCategoryPageDto> {
    const result = await this.categoriesService.listActive(options.page, options.pageSize);
    return new CourseCategoryPageDto(
      result.items.map((category) => new CourseCategoryDto(category)),
      options.page,
      options.pageSize,
      result.total,
    );
  }
}
