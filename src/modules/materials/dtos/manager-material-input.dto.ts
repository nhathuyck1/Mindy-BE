import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { MaterialReviewStatus } from '../domain/material-contract.js';
import { MaterialContentType } from '../entities/material.entity.js';

export class CreateManagerMaterialDto {
  @ApiProperty({ enum: MaterialContentType })
  @IsEnum(MaterialContentType)
  readonly contentType!: MaterialContentType;
  @ApiProperty({ maxLength: 250 })
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  readonly title!: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 5000 })
  @ValidateIf((_o, value) => value != null)
  @IsString()
  @MaxLength(5000)
  readonly description?: string | null;
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @ValidateIf((_o, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  readonly sortOrder?: number;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  @ValidateIf((_o, value) => value != null)
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  readonly availableAt?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @ValidateIf((_o, value) => value != null)
  @IsUUID('4')
  readonly sessionId?: string | null;
  @ApiPropertyOptional({ description: 'ARTICLE only. Input and canonical HTML <=48 KiB UTF-8.' })
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  readonly contentHtml?: string;
  @ApiPropertyOptional({ enum: [1], default: 1 })
  @ValidateIf((_o, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1)
  readonly contentSchemaVersion?: number;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for FILE/VIDEO; forbidden for ARTICLE.',
  })
  @ValidateIf((_o, value) => value !== undefined)
  @IsUUID('4')
  readonly fileId?: string;
  @ApiPropertyOptional({ type: [String], maxItems: 50, default: [] })
  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  readonly attachmentFileIds?: string[];
}

export class MaterialRevisionDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  readonly expectedRevision!: number;
}

export class MaterialDeleteQueryDto extends MaterialRevisionDto {
  @Type(() => Number)
  readonly expectedRevision!: number;
}

export class PatchManagerMaterialDto extends PartialType(
  OmitType(CreateManagerMaterialDto, ['contentType', 'contentSchemaVersion'] as const),
  { skipNullProperties: false },
) {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  readonly expectedRevision!: number;
}

export class ManagerMaterialQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly courseUnitId?: string;
  @ApiPropertyOptional({ enum: MaterialReviewStatus })
  @IsOptional()
  @IsEnum(MaterialReviewStatus)
  readonly reviewStatus?: MaterialReviewStatus;
  @ApiPropertyOptional({ enum: MaterialContentType })
  @IsOptional()
  @IsEnum(MaterialContentType)
  readonly contentType?: MaterialContentType;
}
