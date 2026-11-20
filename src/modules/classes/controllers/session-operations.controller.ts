import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
// biome-ignore lint/style/useImportType: Nest request validation needs runtime DTO metadata.
import {
  CreateMakeupSessionDto,
  MakeupSessionDto,
  RescheduleSessionDto,
  SessionOperationDto,
} from '../dtos/session-operations.dto.js';
import { TeachingSessionDto } from '../dtos/teaching.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { SessionOperationsService } from '../services/session-operations.service.js';

@ApiTags('teaching-management')
@Controller('management/class-sessions')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiCookieAuth('access_token')
@ApiHeader({ name: 'Idempotency-Key', required: true, schema: { type: 'string', format: 'uuid' } })
@ApiErrors(
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.BAD_REQUEST,
  HttpStatus.NOT_FOUND,
  HttpStatus.CONFLICT,
  HttpStatus.UNPROCESSABLE_ENTITY,
)
export class SessionOperationsController {
  constructor(private readonly operations: SessionOperationsService) {}

  @Patch(':sessionId/schedule')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Reschedule a future scheduled session atomically' })
  @ApiOkResponse({ type: TeachingSessionDto })
  async reschedule(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @Body() input: RescheduleSessionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<TeachingSessionDto> {
    return this.operations.reschedule(id, input, actor, key);
  }

  @Post(':sessionId/cancel')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Cancel a scheduled or in-progress session, preserving attendance' })
  @ApiOkResponse({ type: TeachingSessionDto })
  async cancel(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @Body() input: SessionOperationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<TeachingSessionDto> {
    return this.operations.cancel(id, input, actor, key);
  }

  @Post(':sessionId/makeups')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Replace the latest cancelled session and extend the class when needed',
  })
  @ApiCreatedResponse({ type: MakeupSessionDto })
  async makeup(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @Body() input: CreateMakeupSessionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<MakeupSessionDto> {
    return this.operations.makeup(id, input, actor, key);
  }
}
