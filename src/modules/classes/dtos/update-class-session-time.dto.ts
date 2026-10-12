import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateClassSessionTimeDto {
  @ApiProperty({
    type: String,
    example: '07:30',
    pattern: CLOCK_TIME_PATTERN.source,
    description: 'HH:mm in APP_TIME_ZONE; preserves the existing local start date',
  })
  @IsString()
  @Matches(CLOCK_TIME_PATTERN)
  readonly startTime!: string;

  @ApiProperty({
    type: String,
    example: '09:30',
    pattern: CLOCK_TIME_PATTERN.source,
    description: 'HH:mm in APP_TIME_ZONE; preserves the existing local end date',
  })
  @IsString()
  @Matches(CLOCK_TIME_PATTERN)
  readonly endTime!: string;
}

export class BulkUpdateClassSessionTimeDto extends UpdateClassSessionTimeDto {
  @ApiProperty({
    type: String,
    isArray: true,
    format: 'uuid',
    minItems: 1,
    maxItems: 100,
    uniqueItems: true,
    description: 'Selected sessions of this class; same times apply to all',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  readonly sessionIds!: string[];
}
