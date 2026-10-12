import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Nest validation requires runtime DTO metadata.
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import {
  StudentMaterialDownloadDto,
  StudentMaterialDto,
  StudentMaterialPageDto,
} from '../dtos/student-material.dto.js';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor tokens.
import { StudentMaterialsService } from '../services/student-materials.service.js';

@ApiTags('student materials')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@ApiErrors(
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
@Controller('me/classes/:classId')
export class StudentMaterialsController {
  constructor(private readonly materials: StudentMaterialsService) {}

  @Get('units/:classUnitId/materials')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'List approved, released materials for an ACTIVE student',
    description:
      'Only visible FILE/VIDEO materials count toward pagination. Locked/future units return an empty page. Sort: sortOrder ASC, id ASC.',
  })
  @ApiOkResponse({ type: StudentMaterialPageDto })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('classUnitId', new ParseUUIDPipe({ version: '4' })) classUnitId: string,
    @Query() options: PageOptionsDto,
  ): Promise<StudentMaterialPageDto> {
    const result = await this.materials.list(user, classId, classUnitId, options);
    return new StudentMaterialPageDto(
      result.items.map((item) => new StudentMaterialDto(item)),
      options.page,
      options.pageSize,
      result.total,
      result.asOf,
    );
  }

  @Get('materials/:materialId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read a visible material through the enrolled class',
    description:
      'Re-checks approval/release/file readiness; hidden or foreign materials return MATERIAL_NOT_FOUND. Does not issue a signed URL.',
  })
  @ApiOkResponse({ type: StudentMaterialDto })
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
  ): Promise<StudentMaterialDto> {
    return new StudentMaterialDto(await this.materials.detail(user, classId, materialId));
  }

  @Get('materials/:materialId/download')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Authorize and issue a short-lived signed file URL',
    description:
      'JSON response, no redirect. Signs the verified immutable object version for at most 60 seconds. Re-check access on every refresh; issued URLs may remain usable until expiry.',
  })
  @ApiOkResponse({ type: StudentMaterialDownloadDto })
  @ApiErrors(HttpStatus.CONFLICT, HttpStatus.SERVICE_UNAVAILABLE)
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
  ): Promise<StudentMaterialDownloadDto> {
    return this.materials.download(user, classId, materialId);
  }
}
