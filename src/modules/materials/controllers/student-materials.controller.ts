import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
// biome-ignore lint/style/useImportType: Runtime query validation metadata.
import { MaterialRevisionQueryDto } from '../dtos/material-authoring.dto.js';
import { MaterialFileAccessDto } from '../dtos/material-file-access.dto.js';
import {
  StudentMaterialDetailDto,
  StudentMaterialDownloadDto,
  StudentMaterialDto,
  StudentMaterialPageDto,
} from '../dtos/student-material.dto.js';
import { MaterialOriginGuard } from '../guards/material-origin.guard.js';
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
      'Only visible ARTICLE/FILE/VIDEO materials count toward pagination; items never include ARTICLE HTML. Locked/future units return an empty page. Sort: sortOrder ASC, id ASC.',
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
      'Re-checks approval/release/file readiness; hidden or foreign materials return MATERIAL_NOT_FOUND. ARTICLE returns sanitized contentHtml; inline images/attachments are metadata only. Does not issue a signed URL.',
  })
  @ApiOkResponse({ type: StudentMaterialDetailDto })
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
  ): Promise<StudentMaterialDetailDto> {
    return new StudentMaterialDetailDto(await this.materials.detail(user, classId, materialId));
  }

  @Get('materials/:materialId/download')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Authorize and issue a short-lived signed file URL',
    description:
      'Primary FILE/VIDEO only (ARTICLE returns MATERIAL_NOT_FOUND). JSON response, no redirect. Signs the verified immutable object version for at most 60 seconds. Re-check access on every refresh; issued URLs may remain usable until expiry.',
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

  @Get('materials/:materialId/assets/:fileId/access')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read a referenced inline image or attachment at the expected revision',
  })
  @ApiOkResponse({ type: MaterialFileAccessDto })
  @ApiErrors(HttpStatus.CONFLICT, HttpStatus.SERVICE_UNAVAILABLE)
  assetAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Query() input: MaterialRevisionQueryDto,
  ): Promise<MaterialFileAccessDto> {
    return this.materials.accessAtRevision(
      user,
      classId,
      materialId,
      fileId,
      input.expectedRevision,
    );
  }

  @Post('materials/:materialId/files/:fileId/access')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MaterialOriginGuard)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Issue a short-lived signed URL for a file referenced by a visible material',
    description:
      'fileId must be the primary file, an ARTICLE inline image or an attachment of this material; otherwise MATERIAL_NOT_FOUND. No request body. Attachments are signed with attachment disposition, others inline. Re-checks access after signing.',
  })
  @ApiOkResponse({ type: MaterialFileAccessDto })
  @ApiErrors(HttpStatus.CONFLICT, HttpStatus.SERVICE_UNAVAILABLE)
  async access(
    @CurrentUser() user: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
  ): Promise<MaterialFileAccessDto> {
    return this.materials.access(user, classId, materialId, fileId);
  }
}
