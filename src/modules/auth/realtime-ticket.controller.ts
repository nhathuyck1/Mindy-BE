import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ApiErrors } from '../../decorators/api-errors.decorator.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from './auth.types.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Roles } from './decorators/roles.decorator.js';
import {
  AuthenticationRequiredException,
  InsufficientRoleException,
} from './exceptions/auth.exceptions.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TokenService } from './services/token.service.js';

export class RealtimeTicketInput {
  @ApiProperty({ enum: ['chat', 'whiteboards'] })
  @IsIn(['chat', 'whiteboards'])
  channel!: 'chat' | 'whiteboards';
}
export class RealtimeTicketDto {
  @ApiProperty({
    description: 'Memory-only ticket, valid for at most 60 seconds; never an access/refresh token.',
  })
  ticket!: string;
  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}
@ApiTags('auth')
@ApiCookieAuth('access_token')
@ApiErrors(
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.UNPROCESSABLE_ENTITY,
  HttpStatus.SERVICE_UNAVAILABLE,
)
@Controller('auth/realtime-ticket')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.MENTOR, UserRole.STUDENT)
export class RealtimeTicketController {
  constructor(
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}
  @Post()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie, Origin')
  @ApiOperation({ summary: 'Issue a short-lived, origin/channel-bound realtime handshake ticket' })
  @ApiOkResponse({ type: RealtimeTicketDto })
  issue(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: RealtimeTicketInput,
    @Headers('origin') origin: string | undefined,
    @Req() request: { cookies?: Record<string, string> },
  ): RealtimeTicketDto {
    const allowed = this.config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!origin || !allowed.includes(origin)) throw new InsufficientRoleException();
    const enabled = this.config.get<boolean>(
      input.channel === 'chat' ? 'CHAT_ENABLED' : 'WHITEBOARD_ENABLED',
      false,
    );
    if (!enabled) throw new ServiceUnavailableException('Realtime channel is disabled');
    const accessToken = request.cookies?.access_token;
    if (!accessToken) throw new AuthenticationRequiredException();
    try {
      const { expiresAt } = this.tokens.verifyAccessTokenWithExpiry(accessToken);
      return this.tokens.signRealtimeTicket(actor, expiresAt, origin, input.channel);
    } catch {
      throw new AuthenticationRequiredException();
    }
  }
}
