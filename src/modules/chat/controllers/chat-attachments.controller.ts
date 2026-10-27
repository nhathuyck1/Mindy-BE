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
  Res,
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
import { ChatUploadInput } from '../dtos/chat.dto.js';
import { ApiChat } from '../dtos/chat-openapi.js';
import { ChatException } from '../exceptions/chat.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatAttachmentsService } from '../services/chat-attachments.service.js';

@ApiTags('Chat attachments')
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.MENTOR, UserRole.STUDENT)
@Controller('chat/conversations/:conversationId')
export class ChatAttachmentsController {
  constructor(private readonly files: ChatAttachmentsService) {}
  @Post('attachments/upload-intents')
  @ApiChat('intent', 201)
  async intent(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ChatUploadInput,
    @Headers('idempotency-key') key: string,
    @Res({ passthrough: true }) response: { status: (code: number) => void },
  ): ReturnType<ChatAttachmentsService['intent']> {
    if (!key) throw new ChatException(422, 'CHAT_INVALID_INPUT');
    const result = await this.files.intent(actor, id, input, key);
    response.status(result.replayed ? 200 : 201);
    return result;
  }
  @Post('attachments/:fileId/complete')
  @ApiChat('status', 202)
  async complete(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Res({ passthrough: true }) response: { status: (status: number) => void },
  ): ReturnType<ChatAttachmentsService['status']> {
    const result = await this.files.complete(actor, id, fileId);
    response.status(result.status === 'PROCESSING' ? 202 : 200);
    return result;
  }
  @Get('attachments/:fileId')
  @ApiChat('status', 200)
  @Header('Cache-Control', 'no-store')
  status(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
  ): ReturnType<ChatAttachmentsService['status']> {
    return this.files.status(actor, id, fileId);
  }
  @Post('messages/:messageId/file-access')
  @ApiChat('fileAccess', 200)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  sign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' })) messageId: string,
  ): ReturnType<ChatAttachmentsService['sign']> {
    return this.files.sign(actor, id, messageId);
  }
}
