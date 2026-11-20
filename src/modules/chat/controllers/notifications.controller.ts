import {
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
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RequestOriginGuard } from '../../../common/guards/request-origin.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DTO reflection.
import { NotificationQuery } from '../dtos/chat.dto.js';
import { ApiChat } from '../dtos/chat-openapi.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatNotificationsService } from '../services/chat-notifications.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatSocketService } from '../services/chat-socket.service.js';

@ApiTags('Notifications')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.MENTOR, UserRole.STUDENT)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: ChatNotificationsService,
    private readonly sockets: ChatSocketService,
  ) {}
  @Get()
  @ApiChat('notifications', 200)
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() q: NotificationQuery,
  ): ReturnType<ChatNotificationsService['list']> {
    return this.notifications.list(actor, q);
  }
  @Get('unread-count')
  @ApiChat('count', 200)
  @Header('Cache-Control', 'no-store')
  count(@CurrentUser() actor: AuthenticatedUser): ReturnType<ChatNotificationsService['count']> {
    return this.notifications.count(actor);
  }
  @Post('read-all')
  @ApiChat('readAll', 200)
  @HttpCode(200)
  async readAll(
    @CurrentUser() actor: AuthenticatedUser,
  ): ReturnType<ChatNotificationsService['readAll']> {
    const result = await this.notifications.readAll(actor);
    await this.sockets.own(actor.userId, 'notifications:read', result);
    return result;
  }
  @Patch(':notificationId/read')
  @ApiChat('notification', 200)
  @HttpCode(200)
  async read(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('notificationId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): ReturnType<ChatNotificationsService['read']> {
    const result = await this.notifications.read(actor, id);
    await this.sockets.own(actor.userId, 'notifications:read', {
      readAt: result.readAt,
      resyncRequired: true,
    });
    return result;
  }
}
