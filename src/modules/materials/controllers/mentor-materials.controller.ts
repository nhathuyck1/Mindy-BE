import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { ManagerMaterialDetailDto, ManagerMaterialPageDto } from '../dtos/manager-material.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO metadata.
import { MaterialDeleteQueryDto, MaterialRevisionDto } from '../dtos/manager-material-input.dto.js';
import { MaterialFileAccessDto } from '../dtos/material-file-access.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO metadata.
import {
  CreateMentorMaterialDto,
  MentorMaterialQueryDto,
  PatchMentorMaterialDto,
} from '../dtos/mentor-material-input.dto.js';
import { MaterialOriginGuard } from '../guards/material-origin.guard.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MaterialAuthoringService } from '../services/material-authoring.service.js';

@ApiTags('mentor-materials')
@ApiCookieAuth('access_token')
@Controller('mentor/classes/:classId')
@UseGuards(AccessTokenGuard, RolesGuard, MaterialOriginGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(400, 401, 403, 404, 409, 413, 422)
export class MentorMaterialsController {
  constructor(private readonly materials: MaterialAuthoringService) {}

  @Post('units/:unitId/materials')
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: ManagerMaterialDetailDto })
  @ApiOperation({ summary: 'Create own typed draft in an assigned Class Unit' })
  create(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('unitId', new ParseUUIDPipe({ version: '4' })) unitId: string,
    @Body() input: CreateMentorMaterialDto,
  ): Promise<ManagerMaterialDetailDto> {
    return this.materials.create(principal, unitId, input, { classId, classUnitId: unitId });
  }
  @Get('units/:unitId/materials')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManagerMaterialPageDto })
  @ApiOperation({ summary: 'List published content and own submissions before pagination' })
  list(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('unitId', new ParseUUIDPipe({ version: '4' })) unitId: string,
    @Query() options: MentorMaterialQueryDto,
  ): Promise<ManagerMaterialPageDto> {
    return this.materials.list(principal, options, unitId, { classId, classUnitId: unitId });
  }
  @Get('materials/:materialId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManagerMaterialDetailDto })
  @ApiOperation({ summary: 'Read visible material metadata in an assigned class' })
  detail(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ManagerMaterialDetailDto> {
    return this.materials.detail(principal, id, { classId });
  }
  @Patch('materials/:materialId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManagerMaterialDetailDto })
  @ApiOperation({ summary: 'Edit own never-approved DRAFT/REJECTED with expectedRevision' })
  patch(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: PatchMentorMaterialDto,
  ): Promise<ManagerMaterialDetailDto> {
    return this.materials.patch(principal, id, input, { classId });
  }
  @Delete('materials/:materialId')
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'Soft delete own never-approved draft; authorized retry is a no-op' })
  delete(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() input: MaterialDeleteQueryDto,
  ): Promise<void> {
    return this.materials.delete(principal, id, input.expectedRevision, { classId });
  }
  @Post('materials/:materialId/submit')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOkResponse({ type: ManagerMaterialDetailDto })
  @ApiOperation({ summary: 'Submit own draft for review; same pending revision is a no-op' })
  submit(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: MaterialRevisionDto,
  ): Promise<ManagerMaterialDetailDto> {
    return this.materials.submit(principal, id, input.expectedRevision, { classId });
  }

  @Post('materials/:materialId/files/:fileId/access')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: MaterialFileAccessDto })
  @ApiErrors(503)
  @ApiOperation({
    summary: 'Preview a referenced binary of a published material or own unapproved draft',
    description:
      'fileId must be the primary file, an inline image or an attachment of this material. No request body. Signed for at most 60 seconds (attachment disposition for attachments); access is re-checked after signing.',
  })
  preview(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
  ): Promise<MaterialFileAccessDto> {
    return this.materials.preview(principal, id, fileId, { classId });
  }
}
