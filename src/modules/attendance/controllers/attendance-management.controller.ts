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
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import { AttendanceWriteDto } from '../dtos/attendance.dto.js';
import { AttendanceAuditPageDto } from '../dtos/attendance-audit.dto.js';
// biome-ignore lint/style/useImportType: Nest validation needs runtime DTO metadata.
import { AttendanceAuditQueryDto, RecoverAttendanceDto } from '../dtos/attendance-input.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { AttendanceService } from '../services/attendance.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { AttendanceAuditService } from '../services/attendance-audit.service.js';

@ApiTags('attendance-management')
@Controller('management/class-sessions')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiCookieAuth('access_token')
@ApiErrors(
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.CONFLICT,
  HttpStatus.UNPROCESSABLE_ENTITY,
  HttpStatus.PAYLOAD_TOO_LARGE,
)
export class AttendanceManagementController {
  constructor(
    private readonly audits: AttendanceAuditService,
    private readonly attendance: AttendanceService,
  ) {}

  @Get(':sessionId/attendance-audits')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read Staff attendance history, optionally filtered by same-class enrollment',
  })
  @ApiOkResponse({ type: AttendanceAuditPageDto })
  history(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AttendanceAuditQueryDto,
  ): Promise<AttendanceAuditPageDto> {
    return this.audits.list(id, actor, query);
  }

  @Post(':sessionId/attendance/recover')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Recover missing attendance from historical evidence; insert-only, 256 KiB body limit',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ type: AttendanceWriteDto })
  recover(
    @Param('sessionId', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: RecoverAttendanceDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<AttendanceWriteDto> {
    return this.attendance.recover(id, input, actor, key);
  }
}
