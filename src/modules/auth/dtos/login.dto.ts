import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ type: String, format: 'email', example: 'admin@gmail.com' })
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;

  @ApiProperty({ type: String, format: 'password', minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  readonly password!: string;

  @ApiPropertyOptional({ type: String, example: 'Swagger UI' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  readonly deviceName?: string;
}
