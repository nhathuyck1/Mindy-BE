import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { MAX_PRICE_AMOUNT } from './create-course.dto.js';

export class UpdateCourseDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID('4')
  readonly categoryId?: string;

  @ApiPropertyOptional({ type: String, maxLength: 250 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 250)
  readonly title?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 10000,
    description: 'Send null to clear the description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  readonly description?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uri',
    nullable: true,
    maxLength: 2048,
    description: 'Send null to clear the course image; omit to keep the current image',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, disallow_auth: true })
  @MaxLength(2048)
  readonly imgUrl?: string | null;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    maximum: MAX_PRICE_AMOUNT,
    description: 'Integer VND amount; applies to future checkouts only',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_AMOUNT)
  readonly priceAmount?: number;
}
