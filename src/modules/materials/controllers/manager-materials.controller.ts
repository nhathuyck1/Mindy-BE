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
import {
  CreateManagerMaterialDto,
  ManagerMaterialQueryDto,
  MaterialDeleteQueryDto,
  MaterialRevisionDto,
  PatchManagerMaterialDto,
  RejectMaterialDto,
} from '../dtos/manager-material-input.dto.js';
import { MaterialOriginGuard } from '../guards/material-origin.guard.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MaterialAuthoringService } from '../services/material-authoring.service.js';

@ApiTags('manager-materials')
@ApiCookieAuth('access_token')
@Controller('manager')
@UseGuards(AccessTokenGuard, RolesGuard, MaterialOriginGuard)
@Roles(UserRole.MANAGER)
@ApiErrors(400, 401, 403, 404, 409, 413, 422)
export class ManagerMaterialsController {
  constructor(private readonly materials: MaterialAuthoringService) {}

  @Post('course-units/:courseUnitId/materials')
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: ManagerMaterialDetailDto })
  @ApiOperation({ summary: 'Create a typed Course Unit material draft' })
  create(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('courseUnitId', new ParseUUIDPipe({ version: '4' })) unitId: string,
    @Body() input: CreateManagerMaterialDto,
  ) {
    return this.materials.create(principal, unitId, input);
  }

  @Get('course-units/:courseUnitId/materials')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManagerMaterialPageDto })
  listUnit(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('courseUnitId', new ParseUUIDPipe({ version: '4' })) unitId: string,
    @Query() options: ManagerMaterialQueryDto,
  ) {
    return this.materials.list(principal, options, unitId);
  }

  @Get('materials')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManagerMaterialPageDto })
  list(@CurrentUser() principal: AuthenticatedUser, @Query() options: ManagerMaterialQueryDto) {
    return this.materials.list(principal, options);
  }

  @Get('materials/:materialId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManagerMaterialDetailDto })
  detail(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.materials.detail(principal, id);
  }

  @Patch('materials/:materialId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManagerMaterialDetailDto })
  @ApiOperation({
    summary: 'Edit with expectedRevision; return to DRAFT and revoke approval/publication',
  })
  patch(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: PatchManagerMaterialDto,
  ) {
    return this.materials.patch(principal, id, input);
  }

  @Delete('materials/:materialId')
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  @ApiNoContentResponse()
  delete(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() input: MaterialDeleteQueryDto,
  ) {
    return this.materials.delete(principal, id, input.expectedRevision);
  }

  @Post('materials/:materialId/approve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManagerMaterialDetailDto })
  @ApiOperation({ summary: 'Approve and publish the expected revision; retries preserve state' })
  approve(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: MaterialRevisionDto,
  ): Promise<ManagerMaterialDetailDto> {
    return this.materials.review(principal, id, { action: 'APPROVE', ...input });
  }

  @Post('materials/:materialId/reject')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManagerMaterialDetailDto })
  @ApiOperation({ summary: 'Reject a pending revision with a reason' })
  reject(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: RejectMaterialDto,
  ): Promise<ManagerMaterialDetailDto> {
    return this.materials.review(principal, id, { action: 'REJECT', ...input });
  }

  @Post('materials/:materialId/publish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManagerMaterialDetailDto })
  @ApiOperation({ summary: 'Publish the currently approved revision with READY references' })
  publish(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: MaterialRevisionDto,
  ): Promise<ManagerMaterialDetailDto> {
    return this.materials.review(principal, id, { action: 'PUBLISH', ...input });
  }

  @Post('materials/:materialId/unpublish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManagerMaterialDetailDto })
  @ApiOperation({ summary: 'Clear publication while preserving approval and revision' })
  unpublish(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: MaterialRevisionDto,
  ): Promise<ManagerMaterialDetailDto> {
    return this.materials.review(principal, id, { action: 'UNPUBLISH', ...input });
  }
}
