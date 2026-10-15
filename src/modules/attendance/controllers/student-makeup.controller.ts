import { Controller, Get, Header, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest validation needs runtime DTO metadata.
import { MakeupListQueryDto, MakeupPlacementPageDto } from '../dtos/makeup.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { MakeupPlacementService } from '../services/makeup-placement.service.js';

@ApiTags('student-makeup')
@Controller('me/makeup-placements')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@ApiCookieAuth('access_token')
@ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN, HttpStatus.UNPROCESSABLE_ENTITY)
export class StudentMakeupController {
  constructor(private readonly service: MakeupPlacementService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read own makeup placements and attendance metadata' })
  @ApiOkResponse({ type: MakeupPlacementPageDto })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MakeupListQueryDto,
  ): Promise<MakeupPlacementPageDto> {
    return this.service.own(actor, query);
  }
}
