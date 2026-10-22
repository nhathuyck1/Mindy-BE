import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestOriginGuard } from '../../../common/guards/request-origin.guard.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Runtime DTO validation metadata.
import {
  CorrectTeachingNoteInput,
  TeachingNoteInput,
  TeachingNoteResponseDto,
} from '../dtos/teaching-note.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TeachingNotesService } from '../services/teaching-notes.service.js';

@ApiTags('teaching notes')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.MENTOR)
@ApiErrors(400, 401, 403, 404, 409, 422)
@Controller('class-sessions/:sessionId/teaching-notes')
export class MentorTeachingNotesController {
  constructor(private readonly notes: TeachingNotesService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Assigned mentor reads internal teaching notes' })
  @ApiOkResponse({ type: TeachingNoteResponseDto })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TeachingNoteResponseDto> {
    return this.notes.get(id, actor, false);
  }
  @Put()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Save internal teaching notes within the session editing window' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ type: TeachingNoteResponseDto })
  put(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: TeachingNoteInput,
    @Headers('idempotency-key') key?: string,
  ): Promise<TeachingNoteResponseDto> {
    return this.notes.put(id, actor, input, key, false);
  }
}

@ApiTags('teaching notes')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiErrors(400, 401, 403, 404, 409, 422)
@Controller('management/class-sessions/:sessionId/teaching-notes')
export class ManagementTeachingNotesController {
  constructor(private readonly notes: TeachingNotesService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Staff reads internal teaching notes' })
  @ApiOkResponse({ type: TeachingNoteResponseDto })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TeachingNoteResponseDto> {
    return this.notes.get(id, actor, true);
  }
  @Put()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Correct internal teaching notes with an audit reason' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ type: TeachingNoteResponseDto })
  put(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: CorrectTeachingNoteInput,
    @Headers('idempotency-key') key?: string,
  ): Promise<TeachingNoteResponseDto> {
    return this.notes.put(id, actor, input, key, true);
  }
}
