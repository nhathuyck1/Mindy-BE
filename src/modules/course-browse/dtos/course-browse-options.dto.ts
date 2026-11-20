import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { DeliveryMode } from '../../classes/enums/delivery-mode.enum.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Filters for open classes: delivery mode and a range for the class start date. */
export class OpenClassPageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, enum: DeliveryMode })
  @IsOptional()
  @IsEnum(DeliveryMode)
  readonly deliveryMode?: DeliveryMode;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Classes starting on or after this date',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'startsFrom must be a YYYY-MM-DD date' })
  @IsISO8601({ strict: true })
  readonly startsFrom?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Classes starting on or before this date',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'startsTo must be a YYYY-MM-DD date' })
  @IsISO8601({ strict: true })
  readonly startsTo?: string;
}

/**
 * Public course list filters. Delivery mode and date filters keep only courses that have a
 * matching open class.
 */
export class PublicCoursePageOptionsDto extends OpenClassPageOptionsDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly categoryId?: string;
}
