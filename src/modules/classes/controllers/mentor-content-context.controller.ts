import { Controller, Get, Header, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Runtime DTO metadata.
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { ClassUnitManagementDto } from '../dtos/class.dto.js';
import {
  MentorContentSessionPageDto,
  MentorContentUnitPageDto,
} from '../dtos/mentor-content-context.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MentorContentContextService } from '../services/mentor-content-context.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { UnitContentService } from '../services/unit-content.service.js';

@ApiTags('mentor-content-context')
@ApiCookieAuth('access_token')
@Controller('mentor/classes/:classId/units')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(400, 401, 403, 404, 422)
export class MentorContentContextController {
  constructor(
    private readonly contexts: MentorContentContextService,
    private readonly content: UnitContentService,
  ) {}
  @Get(':unitId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read an assigned Class Unit and its sessions for authoring' })
  @ApiOkResponse({ type: ClassUnitManagementDto })
  detail(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('unitId', new ParseUUIDPipe({ version: '4' })) unitId: string,
  ): Promise<ClassUnitManagementDto> {
    return this.content.detail(principal, classId, unitId);
  }
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List assigned Class Units for content authoring' })
  @ApiOkResponse({ type: MentorContentUnitPageDto })
  units(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Query() options: PageOptionsDto,
  ): Promise<MentorContentUnitPageDto> {
    return this.contexts.units(principal, classId, options);
  }
  @Get(':unitId/sessions')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List safe session context for an assigned Class Unit' })
  @ApiOkResponse({ type: MentorContentSessionPageDto })
  sessions(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('unitId', new ParseUUIDPipe({ version: '4' })) unitId: string,
    @Query() options: PageOptionsDto,
  ): Promise<MentorContentSessionPageDto> {
    return this.contexts.sessions(principal, classId, unitId, options);
  }
}
