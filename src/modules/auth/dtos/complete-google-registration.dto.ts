import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CompleteGoogleRegistrationDto {
  @ApiProperty({ type: String, example: 'Nguyen Van A', minLength: 1, maxLength: 150 })
  @IsString()
  @Length(1, 150)
  @Matches(/\S/, { message: 'displayName must contain at least one non-space character' })
  readonly displayName!: string;

  @ApiPropertyOptional({ type: String, example: '0901234567', minLength: 7, maxLength: 32 })
  @IsOptional()
  @IsString()
  @Length(7, 32)
  readonly phone?: string;

  @ApiPropertyOptional({ type: String, example: 'Chrome on Windows', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  readonly deviceName?: string;
}
