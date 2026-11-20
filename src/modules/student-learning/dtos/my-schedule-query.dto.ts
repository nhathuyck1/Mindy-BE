import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateBy,
  type ValidationArguments,
} from 'class-validator';

import {
  MAX_SCHEDULE_RANGE_DAYS,
  scheduleRangeError,
  ZONED_TIMESTAMP_PATTERN,
} from '../domain/schedule-range.js';

function toBoolean(value: unknown): unknown {
  if (value === 'true') {
    return true;
  }

  return value === 'false' ? false : value;
}

/** Validates `to` against the sibling `from` with the shared range rule. */
function IsScheduleRangeEnd(): PropertyDecorator {
  return ValidateBy({
    name: 'isScheduleRangeEnd',
    validator: {
      validate: (value: unknown, args?: ValidationArguments): boolean => {
        const from: unknown = (args?.object as { from?: unknown } | undefined)?.from;
        if (typeof value !== 'string' || typeof from !== 'string') {
          return false;
        }
        return scheduleRangeError(new Date(from), new Date(value)) === null;
      },
      defaultMessage: () =>
        `to must be later than from and at most ${MAX_SCHEDULE_RANGE_DAYS} days after it`,
    },
  });
}

const TIMESTAMP_MESSAGE = '$property must be an ISO 8601 timestamp with Z or a ±HH:MM offset';

export class MyScheduleQueryDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-11T17:00:00Z',
    description: 'Inclusive range start; must carry Z or an offset',
  })
  @IsISO8601({ strict: true }, { message: TIMESTAMP_MESSAGE })
  @Matches(ZONED_TIMESTAMP_PATTERN, { message: TIMESTAMP_MESSAGE })
  readonly from!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-18T17:00:00Z',
    description: `Exclusive range end; later than from and at most ${MAX_SCHEDULE_RANGE_DAYS} days after it`,
  })
  @IsISO8601({ strict: true }, { message: TIMESTAMP_MESSAGE })
  @Matches(ZONED_TIMESTAMP_PATTERN, { message: TIMESTAMP_MESSAGE })
  @IsScheduleRangeEnd()
  readonly to!: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly pageSize: number = 100;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Only this class; 403 when the student cannot view its schedule',
  })
  @IsOptional()
  @IsUUID('4')
  readonly classId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    description: 'Include CANCELLED sessions so the student sees which sessions were cancelled',
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  readonly includeCancelled: boolean = true;
}
