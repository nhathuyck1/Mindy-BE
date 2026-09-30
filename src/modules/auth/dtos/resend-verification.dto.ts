import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({ type: String, format: 'email', example: 'student@example.com' })
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;
}
