import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestOriginGuard } from '../../../common/guards/request-origin.guard.js';
import { ApiErrors } from '../../../decorators/api-errors.decorator.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatSocketService } from '../../chat/services/chat-socket.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DTO reflection.
import {
  EmptyNotificationInput,
  NotificationCountDto,
  NotificationDto,
  NotificationPageDto,
  NotificationQuery,
  NotificationReadAllDto,
  NotificationScopeQuery,
} from '../dtos/notification.dto.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { NotificationInboxService } from '../services/notification-inbox.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { NotificationSocketService } from '../services/notification-socket.service.js';

@ApiTags('Notification inbox')
@ApiCookieAuth('access_token')
@ApiErrors(400, 401, 403, 404, 410, 422, 503)
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.MENTOR, UserRole.STUDENT, UserRole.MANAGER, UserRole.ADMIN)
@Controller('notification-inbox')
export class NotificationInboxController {
  constructor(
    private readonly inbox: NotificationInboxService,
    private readonly sockets: NotificationSocketService,
    private readonly chat: ChatSocketService,
  ) {}
  @Get()
  @ApiOkResponse({ type: NotificationPageDto })
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List visible notifications; BUSINESS excludes chat' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: NotificationQuery,
  ): ReturnType<NotificationInboxService['list']> {
    return this.inbox.list(actor, query);
  }
  @Get('unread-count')
  @ApiOkResponse({ type: NotificationCountDto })
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Count visible unread notifications in ALL or BUSINESS scope' })
  count(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: NotificationScopeQuery,
  ): ReturnType<NotificationInboxService['count']> {
    return this.inbox.count(actor, query.category);
  }
  @Patch(':notificationId/read')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: NotificationDto })
  async read(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('notificationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() _body: EmptyNotificationInput,
  ): ReturnType<NotificationInboxService['read']> {
    const result = await this.inbox.read(actor, id),
      signal = { readAt: result.readAt ?? new Date().toISOString(), resyncRequired: true as const };
    if (result.type === 'CHAT_MESSAGE')
      await this.chat.own(actor.userId, 'notifications:read', signal);
    else await this.sockets.read(actor.userId, signal);
    return result;
  }
  @Post('read-all')
  @ApiOkResponse({ type: NotificationReadAllDto })
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark a snapshot of visible unread rows read; BUSINESS preserves chat unread',
  })
  async readAll(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: NotificationScopeQuery,
    @Body() _body: EmptyNotificationInput,
  ): ReturnType<NotificationInboxService['readAll']> {
    const result = await this.inbox.readAll(actor, query.category);
    if (query.category === 'ALL') await this.chat.own(actor.userId, 'notifications:read', result);
    else await this.sockets.read(actor.userId, result);
    return result;
  }
}
