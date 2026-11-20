import { Body, Controller, Get, Header, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsString, Length, Min } from 'class-validator';
import { TrustedOriginGuard } from '../../common/http/trusted-origin.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { SystemRulesService } from './system-rules.service.js';

export class SystemRuleDto {
  @ApiProperty({ enum: ['session_start_time_enforced'] }) readonly key!: string;
  @ApiProperty() readonly value!: boolean;
  @ApiProperty({ minimum: 1 }) readonly version!: number;
  @ApiProperty({ type: Date }) readonly updatedAt!: Date;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly updatedBy!: string | null;
}

export class UpdateSystemRuleDto {
  @ApiProperty() @IsBoolean() readonly value!: boolean;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) readonly expectedVersion!: number;
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  readonly reason!: string;
}

@ApiTags('system-rules')
@ApiCookieAuth('access_token')
@Controller('admin/system-rules')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SystemRulesController {
  constructor(private readonly rules: SystemRulesService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List editable system rules (Admin only)' })
  @ApiOkResponse({ type: SystemRuleDto, isArray: true })
  list() {
    return this.rules.list();
  }

  @Patch(':key')
  @UseGuards(TrustedOriginGuard)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update a known system rule with version check and audit reason' })
  @ApiOkResponse({ type: SystemRuleDto })
  update(
    @Param('key') key: string,
    @Body() input: UpdateSystemRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rules.update(key, input, actor.userId);
  }
}
