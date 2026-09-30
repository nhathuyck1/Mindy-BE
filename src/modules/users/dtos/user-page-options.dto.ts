import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { UserRole } from '../user-role.enum.js';
import { UserStatus } from '../user-status.enum.js';

export class UserPageOptionsDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly pageSize = 20;

  @ApiPropertyOptional({ type: String, enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  readonly role?: UserRole;

  @ApiPropertyOptional({ type: String, enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  readonly status?: UserStatus;
}
