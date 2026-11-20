import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { UserStatus } from '../user-status.enum.js';

export class UpdateUserStatusDto {
  @ApiProperty({ type: String, enum: UserStatus, example: UserStatus.SUSPENDED })
  @IsEnum(UserStatus)
  readonly status!: UserStatus;
}
