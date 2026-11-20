import {
  Controller,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Runtime request validation metadata.
import {
  TRACKING_SOURCES,
  TrackingDetailDto,
  TrackingPageDto,
  TrackingQueryDto,
} from './tracking.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TrackingService } from './tracking.service.js';

@ApiTags('admin tracking')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiErrors(400, 401, 403, 404, 422)
@Controller('admin/tracking/events')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Admin reads paginated activity history; receipt payloads are never exposed',
  })
  @ApiOkResponse({ type: TrackingPageDto })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: TrackingQueryDto,
  ): Promise<TrackingPageDto> {
    return this.tracking.list(actor, query);
  }
  @Get(':source/:eventId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Admin reads original audit fields and optional attendance recovery evidence',
  })
  @ApiParam({ name: 'source', enum: TRACKING_SOURCES })
  @ApiOkResponse({ type: TrackingDetailDto })
  detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('source', new ParseEnumPipe(Object.fromEntries(TRACKING_SOURCES.map((s) => [s, s]))))
    source: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TrackingDetailDto> {
    return this.tracking.detail(actor, source, id);
  }
}
