import {
  Body,
  Controller,
  Delete,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProperty,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { RequestOriginGuard } from '../../common/guards/request-origin.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/user-role.enum.js';
import { PushHttpFilter } from './push-http.filter.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { PushInstallationDto, PushRegistry } from './push-registry.service.js';

export class RegisterPushDto {
  @ApiProperty({ enum: ['WEB'] }) @IsIn(['WEB']) readonly platform!: 'WEB';
  @ApiProperty({ type: String, minLength: 1, maxLength: 4096, writeOnly: true })
  @IsString()
  @MaxLength(4096)
  @Matches(/^[\x21-\x7e]+$/)
  readonly token!: string;
}
export class RevokePushQuery {
  @IsString() @Matches(/^[1-9]\d{0,18}$/) readonly generation!: string;
}
@ApiTags('Notifications')
@UseFilters(PushHttpFilter)
@ApiCookieAuth('access_token')
@UseGuards(AccessTokenGuard, RolesGuard, RequestOriginGuard)
@Roles(UserRole.MENTOR, UserRole.STUDENT)
@Controller('notifications/push/installations')
export class PushController {
  constructor(private readonly registry: PushRegistry) {}
  @Put(':installationId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['installationId', 'platform', 'status', 'generation', 'lastSeenAt'],
      properties: {
        installationId: { type: 'string', format: 'uuid' },
        platform: { type: 'string', enum: ['WEB'] },
        status: { type: 'string', enum: ['ACTIVE'] },
        generation: { type: 'string', pattern: '^[1-9][0-9]*$' },
        lastSeenAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  put(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('installationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: RegisterPushDto,
  ): Promise<PushInstallationDto> {
    return this.registry.put(actor, id, body.token);
  }
  @Delete(':installationId')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiNoContentResponse()
  @ApiQuery({ name: 'generation', required: true, type: String })
  revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('installationId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: RevokePushQuery,
  ): Promise<void> {
    return this.registry.revoke(actor, id, query.generation);
  }
}
