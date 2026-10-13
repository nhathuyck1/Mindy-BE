import { Body, Controller, Header, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestOriginGuard } from '../../../common/guards/request-origin.guard.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { MentorContentUnitDto } from '../dtos/mentor-content-context.dto.js';
// biome-ignore lint/style/useImportType: Runtime DTO validation metadata.
import { UpdateClassUnitReleaseDto } from '../dtos/update-class-unit-release.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ClassUnitReleaseService } from '../services/class-unit-release.service.js';

@ApiTags('class-unit-release')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@ApiErrors(400, 401, 403, 404, 409, 422)
@Controller()
export class ClassUnitReleaseController {
  constructor(private readonly release: ClassUnitReleaseService) {}
  @Patch('admin/classes/:classId/units/:unitId/release')
  @Roles(UserRole.ADMIN)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Admin: lock/open a Class Unit or schedule its release' })
  @ApiOkResponse({ type: MentorContentUnitDto })
  admin(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('unitId', new ParseUUIDPipe({ version: '4' })) unitId: string,
    @Body() input: UpdateClassUnitReleaseDto,
  ): Promise<MentorContentUnitDto> {
    return this.release.update(principal, classId, unitId, input);
  }

  @Patch('mentor/classes/:classId/units/:unitId/release')
  @Roles(UserRole.MENTOR)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Assigned Mentor: lock/open a Class Unit or schedule its release' })
  @ApiOkResponse({ type: MentorContentUnitDto })
  mentor(
    @CurrentUser() principal: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Param('unitId', new ParseUUIDPipe({ version: '4' })) unitId: string,
    @Body() input: UpdateClassUnitReleaseDto,
  ): Promise<MentorContentUnitDto> {
    return this.release.update(principal, classId, unitId, input);
  }
}
