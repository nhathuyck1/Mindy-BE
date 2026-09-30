import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ type: String, minLength: 32, maxLength: 512 })
  @IsString()
  @Length(32, 512)
  readonly token!: string;

  @ApiPropertyOptional({ type: String, example: 'Chrome on Windows', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  readonly deviceName?: string;
}
