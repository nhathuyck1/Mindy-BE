import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
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
// biome-ignore lint/style/useImportType: Nest validation needs runtime DTO metadata.
import {
  CreateMakeupPlacementDto,
  MakeupCandidatePageDto,
  MakeupCandidatesQueryDto,
  MakeupMutationDto,
  MakeupPlacementCreatedDto,
  MakeupPlacementDto,
  ScheduleConflictPageDto,
  ScheduleConflictsQueryDto,
} from '../dtos/makeup.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { MakeupPlacementService } from '../services/makeup-placement.service.js';

@ApiTags('makeup-management')
@Controller('management')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiCookieAuth('access_token')
@ApiErrors(
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.CONFLICT,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
export class MakeupManagementController {
  constructor(private readonly service: MakeupPlacementService) {}
  @Get('student-schedule-conflicts')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read the complete student makeup conflict backlog' })
  @ApiOkResponse({ type: ScheduleConflictPageDto })
  async conflicts(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ScheduleConflictsQueryDto,
  ): Promise<ScheduleConflictPageDto> {
    return this.service.conflicts(actor, query);
  }
  @Get('student-schedule-conflicts/:conflictId/makeup-candidates')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Find equivalent Course Unit sessions with capacity and no student conflict',
  })
  @ApiOkResponse({ type: MakeupCandidatePageDto })
  async candidates(
    @Param('conflictId', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MakeupCandidatesQueryDto,
  ): Promise<MakeupCandidatePageDto> {
    return this.service.candidates(id, actor, query);
  }
  @Post('student-schedule-conflicts/:conflictId/makeup-placement')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Reserve a cross-class makeup seat after explicit content confirmation',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiCreatedResponse({ type: MakeupPlacementCreatedDto })
  async create(
    @Param('conflictId', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateMakeupPlacementDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<MakeupPlacementCreatedDto> {
    return this.service.create(id, input, actor, key);
  }
  @Post('makeup-placements/:placementId/cancel')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Cancel a makeup placement while retaining its attendance history' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ type: MakeupPlacementDto })
  async cancel(
    @Param('placementId', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: MakeupMutationDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<MakeupPlacementDto> {
    return this.service.cancel(id, input, actor, key);
  }
}
