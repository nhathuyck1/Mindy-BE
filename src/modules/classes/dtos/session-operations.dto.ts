import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { ZONED_TIMESTAMP_PATTERN } from '../../student-learning/domain/schedule-range.js';
import { TeachingSessionDto } from './teaching.dto.js';

export class SessionOperationDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  readonly expectedVersion!: number;

  @ApiProperty({ type: String, minLength: 1, maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  readonly reason!: string;
}

export class RescheduleSessionDto extends SessionOperationDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(ZONED_TIMESTAMP_PATTERN)
  readonly startsAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(ZONED_TIMESTAMP_PATTERN)
  readonly endsAt!: string;
}

export class CreateMakeupSessionDto extends RescheduleSessionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID('4')
  readonly classUnitId!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 250 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 250)
  readonly title!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @ValidateIf((_o: unknown, value: unknown) => value !== undefined)
  @IsUUID('4')
  readonly mentorId?: string;
}

export class MakeupSessionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly originalSessionId!: string;

  @ApiProperty({ type: Number })
  readonly originalVersion!: number;

  @ApiProperty({ type: String, format: 'date' })
  readonly classEndDate!: string;

  @ApiProperty({ type: () => TeachingSessionDto })
  readonly session!: TeachingSessionDto;
}
