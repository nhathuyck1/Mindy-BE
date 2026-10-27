import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestOriginGuard } from '../../../common/guards/request-origin.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { ChatPage, ConversationDto, MessageDto } from '../dtos/chat.dto.js';
// biome-ignore lint/style/useImportType: Nest validates reflected DTO classes.
import {
  ChatEventQuery,
  ChatPageQuery,
  ConversationQuery,
  DeleteChatQuery,
  DirectChatInput,
  EditChatInput,
  ReadChatInput,
  SendChatInput,
} from '../dtos/chat.dto.js';
import { ApiChat } from '../dtos/chat-openapi.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { type ChatEventDto, ChatService } from '../services/chat.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatLifecycleService } from '../services/chat-lifecycle.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatSocketService } from '../services/chat-socket.service.js';

@ApiTags('Chat')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.MENTOR, UserRole.STUDENT)
@Controller('chat/conversations')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly lifecycle: ChatLifecycleService,
    private readonly sockets: ChatSocketService,
  ) {}
  @Get()
  @ApiChat('conversations', 200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List currently authorized conversations' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() q: ConversationQuery,
  ): Promise<ChatPage<ConversationDto>> {
    return this.chat.list(actor, q);
  }
  @Post('direct')
  @ApiChat('direct', 201)
  @ApiOperation({ summary: 'Ensure the current mentor/student pair conversation' })
  async direct(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: DirectChatInput,
    @Res({ passthrough: true }) response: { status: (status: number) => void },
  ): Promise<{ conversation: ConversationDto; created: boolean }> {
    const result = await this.lifecycle.ensureDirect(actor.userId, input.peerUserId);
    response.status(result.created ? 201 : 200);
    return { conversation: await this.chat.get(actor, result.id), created: result.created };
  }
  @Get(':conversationId')
  @ApiChat('conversation', 200)
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ConversationDto> {
    return this.chat.get(actor, id);
  }
  @Get(':conversationId/members')
  @ApiChat('members', 200)
  @Header('Cache-Control', 'no-store')
  members(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() q: ChatPageQuery,
  ): ReturnType<ChatService['members']> {
    return this.chat.members(actor, id, q);
  }
  @Get(':conversationId/messages')
  @ApiChat('messages', 200)
  @Header('Cache-Control', 'no-store')
  history(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() q: ChatPageQuery,
  ): Promise<ChatPage<MessageDto>> {
    return this.chat.history(actor, id, q);
  }
  @Post(':conversationId/messages')
  @ApiChat('mutation', 201)
  send(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: SendChatInput,
  ): ReturnType<ChatService['send']> {
    return this.chat.send(actor, id, input);
  }
  @Patch(':conversationId/messages/:messageId')
  @ApiChat('mutation', 200)
  edit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' })) messageId: string,
    @Headers('idempotency-key') key: string,
    @Body() input: EditChatInput,
  ): ReturnType<ChatService['mutate']> {
    return this.chat.mutate(actor, id, messageId, key, input.expectedVersion, input);
  }
  @Delete(':conversationId/messages/:messageId')
  @ApiChat('mutation', 200)
  @HttpCode(200)
  delete(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' })) messageId: string,
    @Headers('idempotency-key') key: string,
    @Query() q: DeleteChatQuery,
  ): ReturnType<ChatService['mutate']> {
    return this.chat.mutate(actor, id, messageId, key, q.expectedVersion, null);
  }
  @Put(':conversationId/read')
  @ApiChat('read', 200)
  async read(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ReadChatInput,
  ): ReturnType<ChatService['read']> {
    const result = await this.chat.read(actor, id, input.throughSequence);
    await this.sockets.readChanged(actor, id, result);
    return result;
  }
  @Get(':conversationId/events')
  @ApiChat('events', 200)
  @Header('Cache-Control', 'no-store')
  events(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() q: ChatEventQuery,
  ): Promise<ChatPage<ChatEventDto>> {
    return this.chat.catchup(actor, id, q);
  }
}

@ApiTags('Chat')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MENTOR, UserRole.STUDENT)
@Controller('classes')
export class ClassChatController {
  constructor(private readonly chat: ChatService) {}
  @Get(':classId/chat')
  @ApiChat('conversation', 200)
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ConversationDto> {
    return this.chat.classChat(actor, id);
  }
}
