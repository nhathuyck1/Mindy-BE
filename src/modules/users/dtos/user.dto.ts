import { ApiProperty } from '@nestjs/swagger';
import type { UserEntity } from '../user.entity.js';
import { UserRole } from '../user-role.enum.js';
import { UserStatus } from '../user-status.enum.js';

export class UserDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: String, format: 'email' })
  readonly email: string;

  @ApiProperty({ type: String, nullable: true })
  readonly phone: string | null;

  @ApiProperty({ type: String })
  readonly displayName: string;

  @ApiProperty({ type: String, enum: UserRole })
  readonly role: UserRole;

  @ApiProperty({ type: String, enum: UserStatus })
  readonly status: UserStatus;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  readonly lastLoginAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: Date;

  constructor(user: UserEntity) {
    this.id = user.id;
    this.email = user.email;
    this.phone = user.phone;
    this.displayName = user.displayName;
    this.role = user.role;
    this.status = user.status;
    this.lastLoginAt = user.lastLoginAt;
    this.createdAt = user.createdAt;
  }
}
