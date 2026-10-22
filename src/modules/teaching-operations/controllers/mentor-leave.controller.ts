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
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  CreateLeaveInput,
  LeaveListQuery,
  LeaveMutationInput,
  LeavePreviewDto,
  LeavePreviewInput,
  LeaveRequestDto,
  LeaveRequestPageDto,
  LeaveSlotsDto,
  LeaveSlotsInput,
} from '../dtos/leave.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { MentorLeaveService } from '../services/mentor-leave.service.js';

@ApiTags('mentor-leave')
@Controller('mentor/leave-requests')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MENTOR)
@ApiCookieAuth('access_token')
@ApiErrors(401, 403, 404, 409, 422)
export class MentorLeaveController {
  constructor(private readonly leaves: MentorLeaveService) {}

  @Post('preview')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: LeavePreviewDto })
  preview(
    @Body() input: LeavePreviewInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LeavePreviewDto> {
    return this.leaves.preview(input, actor);
  }

  @Post('makeup-slots')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: LeaveSlotsDto })
  slots(
    @Body() input: LeaveSlotsInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LeaveSlotsDto> {
    return this.leaves.slots(input, actor);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: LeaveRequestDto })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  create(
    @Body() input: CreateLeaveInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ): Promise<LeaveRequestDto> {
    return this.leaves.create(input, actor, key);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: LeaveRequestPageDto })
  list(
    @Query() query: LeaveListQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LeaveRequestPageDto> {
    return this.leaves.list(query, actor);
  }

  @Get(':requestId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: LeaveRequestDto })
  detail(
    @Param('requestId', new ParseUUIDPipe()) id: string,
    @Query() query: PageOptionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LeaveRequestDto> {
    return this.leaves.detail(id, query, actor);
  }

  @Post(':requestId/withdraw')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: LeaveRequestDto })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  withdraw(
    @Param('requestId', new ParseUUIDPipe()) id: string,
    @Body() input: LeaveMutationInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ): Promise<LeaveRequestDto | import('../dtos/leave.dto.js').LeaveApprovalDto> {
    return this.leaves.mutate(id, 'withdraw', input, actor, key);
  }
}
