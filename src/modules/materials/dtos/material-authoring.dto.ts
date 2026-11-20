import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { MaterialReviewStatus } from '../domain/material-contract.js';
import { MaterialContentType } from '../entities/material.entity.js';

const present = (_object: unknown, value: unknown): boolean => value !== undefined;

export class MaterialMetadataDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  readonly description?: string | null;
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 2147483647, default: 0 })
  @ValidateIf(present)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  readonly sortOrder?: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly availableAt?: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  readonly sessionId?: string | null;
  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 50 })
  @ValidateIf(present)
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  readonly attachmentFileIds?: string[];
}

export class CreateMaterialDto extends MaterialMetadataDto {
  @ApiProperty({ enum: MaterialContentType })
  @IsEnum(MaterialContentType)
  readonly contentType!: MaterialContentType;
  @ApiProperty({ type: String, maxLength: 250 })
  @IsString()
  @Length(1, 250)
  @Matches(/\S/)
  readonly title!: string;
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Required for FILE/VIDEO; forbidden for ARTICLE.',
  })
  @ValidateIf(present)
  @IsUUID('4')
  readonly fileId?: string;
  @ApiPropertyOptional({
    type: String,
    description: 'Required for ARTICLE. Maximum 48 KiB UTF-8; canonical sanitized HTML.',
  })
  @ValidateIf(present)
  @IsString()
  @MaxLength(49152)
  readonly contentHtml?: string;
  @ApiPropertyOptional({ type: Number, enum: [1], default: 1 })
  @ValidateIf(present)
  @Equals(1)
  readonly contentSchemaVersion?: number;
}

export class MaterialRevisionDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  readonly expectedRevision!: number;
}
export class MaterialRevisionQueryDto extends MaterialRevisionDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) declare readonly expectedRevision: number;
}
export class RejectMaterialDto extends MaterialRevisionDto {
  @ApiProperty({ type: String, maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  @Matches(/\S/)
  readonly reason!: string;
}
export class UpdateMaterialDto extends MaterialMetadataDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  readonly expectedRevision!: number;
  @ApiPropertyOptional({ type: String, maxLength: 250 })
  @ValidateIf(present)
  @IsString()
  @Length(1, 250)
  @Matches(/\S/)
  readonly title?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf(present)
  @IsUUID('4')
  readonly fileId?: string;
  @ApiPropertyOptional({ type: String, description: 'ARTICLE only; maximum 48 KiB UTF-8.' })
  @ValidateIf(present)
  @IsString()
  @MaxLength(49152)
  readonly contentHtml?: string;
}
export class MaterialListQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: MaterialReviewStatus })
  @ValidateIf(present)
  @IsEnum(MaterialReviewStatus)
  readonly reviewStatus?: MaterialReviewStatus;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf(present)
  @IsUUID('4')
  readonly courseUnitId?: string;
}
