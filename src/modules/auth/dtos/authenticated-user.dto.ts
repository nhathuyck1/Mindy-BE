import { ApiProperty } from '@nestjs/swagger';

import { UserDto } from '../../users/dtos/user.dto.js';

export class AuthenticatedUserDto {
  @ApiProperty({ type: () => UserDto })
  readonly user: UserDto;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly accessTokenExpiresAt: Date;

  constructor(user: UserDto, accessTokenExpiresAt: Date) {
    this.user = user;
    this.accessTokenExpiresAt = accessTokenExpiresAt;
  }
}
