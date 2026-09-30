import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { UserRole } from '../user-role.enum.js';

export class CreateUserDto {
  @ApiProperty({ type: String, format: 'email', example: 'student@example.com' })
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;

  @ApiPropertyOptional({ type: String, example: '0901234567', minLength: 7, maxLength: 32 })
  @IsOptional()
  @IsString()
  @Length(7, 32)
  readonly phone?: string;

  @ApiProperty({ type: String, format: 'password', minLength: 12, maxLength: 128 })
  @IsString()
  @Length(12, 128)
  readonly password!: string;

  @ApiProperty({ type: String, example: 'Test Student', minLength: 1, maxLength: 150 })
  @IsString()
  @Length(1, 150)
  readonly displayName!: string;

  @ApiProperty({ type: String, enum: UserRole, example: UserRole.STUDENT })
  @IsEnum(UserRole)
  readonly role!: UserRole;
}
