import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { UserStatus } from '../user-status.enum.js';

export class UpdateUserStatusDto {
  @ApiProperty({
    type: String,
    enum: [UserStatus.ACTIVE, UserStatus.SUSPENDED],
    example: UserStatus.SUSPENDED,
  })
  // PENDING_VERIFICATION is only reached through registration, never set by an admin.
  @IsIn([UserStatus.ACTIVE, UserStatus.SUSPENDED])
  readonly status!: UserStatus.ACTIVE | UserStatus.SUSPENDED;
}
