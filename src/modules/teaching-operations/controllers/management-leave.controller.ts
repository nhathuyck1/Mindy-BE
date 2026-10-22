import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import {
  ApproveLeaveInput,
  LeaveApprovalDto,
  LeaveMutationInput,
  LeaveRequestDto,
  LeaveRequestPageDto,
  ManagementLeaveDetailDto,
  ManagementLeaveListQuery,
} from '../dtos/leave.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { MentorLeaveService } from '../services/mentor-leave.service.js';

@ApiTags('mentor-leave-management')
@Controller('management/mentor-leave-requests')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiCookieAuth('access_token')
@ApiErrors(401, 403, 404, 409, 422)
export class ManagementLeaveController {
  constructor(private readonly leaves: MentorLeaveService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: LeaveRequestPageDto })
  list(
    @Query() query: ManagementLeaveListQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LeaveRequestPageDto> {
    return this.leaves.list(query, actor);
  }

  @Get(':requestId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: ManagementLeaveDetailDto })
  detail(
    @Param('requestId', new ParseUUIDPipe()) id: string,
    @Query() query: PageOptionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LeaveRequestDto | ManagementLeaveDetailDto> {
    return this.leaves.detail(id, query, actor);
  }

  @Post(':requestId/approve')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: LeaveApprovalDto })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  approve(
    @Param('requestId', new ParseUUIDPipe()) id: string,
    @Body() input: ApproveLeaveInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ): Promise<LeaveRequestDto | LeaveApprovalDto> {
    return this.leaves.mutate(id, 'approve', input, actor, key);
  }

  @Post(':requestId/reject')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: LeaveRequestDto })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  reject(
    @Param('requestId', new ParseUUIDPipe()) id: string,
    @Body() input: LeaveMutationInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ): Promise<LeaveRequestDto | LeaveApprovalDto> {
    return this.leaves.mutate(id, 'reject', input, actor, key);
  }
}
