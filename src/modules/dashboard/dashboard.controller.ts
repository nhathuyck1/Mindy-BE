import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest validation and Swagger need runtime DTO tokens.
import { DashboardDto, DashboardQueryDto } from './dashboard.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DashboardService } from './dashboard.service.js';
import { ManagerDashboardDto, MentorDashboardDto } from './role-dashboard.dto.js';

@ApiTags('dashboard')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('admin/dashboard')
  @Roles(UserRole.ADMIN)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Center-wide enrollment analytics for administrators' })
  @ApiOkResponse({ type: DashboardDto })
  admin(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardDto> {
    return this.dashboard.overview(actor, query.days);
  }

  @Get('manager/dashboard')
  @Roles(UserRole.MANAGER)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Collected revenue, pending collection and opening alerts' })
  @ApiOkResponse({ type: ManagerDashboardDto })
  manager(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ): Promise<ManagerDashboardDto> {
    return this.dashboard.manager(actor, query.days);
  }

  @Get('mentor/dashboard')
  @Roles(UserRole.MENTOR)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Teaching workload and upcoming sessions in the authenticated mentor scope',
  })
  @ApiOkResponse({ type: MentorDashboardDto })
  mentor(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ): Promise<MentorDashboardDto> {
    return this.dashboard.mentor(actor, query.days);
  }
}
