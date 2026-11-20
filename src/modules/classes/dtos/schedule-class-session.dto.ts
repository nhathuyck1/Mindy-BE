import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import { MEETING_URL_OPTIONS } from './create-class.dto.js';

/** Instants must carry an explicit offset so they never depend on the server time zone. */
const INSTANT_WITH_OFFSET_PATTERN = /T.*(Z|[+-]\d{2}:\d{2})$/;

export class ScheduleClassSessionDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'A unit of this class' })
  @IsUUID('4')
  readonly classUnitId!: string;

  @ApiProperty({ type: String, example: 'Buổi 1 — Giới thiệu', maxLength: 250 })
  @IsString()
  @Length(1, 250)
  readonly title!: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-11-02T19:00:00+07:00' })
  @Matches(INSTANT_WITH_OFFSET_PATTERN, {
    message: 'startsAt must be an ISO 8601 date-time with a time zone offset',
  })
  @IsISO8601({ strict: true })
  readonly startsAt!: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-11-02T21:00:00+07:00' })
  @Matches(INSTANT_WITH_OFFSET_PATTERN, {
    message: 'endsAt must be an ISO 8601 date-time with a time zone offset',
  })
  @IsISO8601({ strict: true })
  readonly endsAt!: string;

  @ApiPropertyOptional({ type: String, example: 'Room A1', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  readonly roomName?: string;

  @ApiPropertyOptional({ type: String, format: 'uri', maxLength: 2048 })
  @IsOptional()
  @IsUrl(MEETING_URL_OPTIONS)
  @MaxLength(2048)
  readonly meetingUrl?: string;
}
