import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class CreateUploadIntentDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') readonly courseUnitId!: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') readonly classId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') readonly classUnitId?: string;
  @ApiProperty({ maxLength: 250 })
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  readonly originalFilename!: string;
  @ApiProperty({ maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  readonly declaredMimeType!: string;
  @ApiProperty({ minimum: 1, maximum: 209715200 })
  @IsInt()
  @Min(1)
  @Max(209715200)
  readonly declaredSizeBytes!: number;
}
