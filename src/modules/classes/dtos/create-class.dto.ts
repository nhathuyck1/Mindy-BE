import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { DeliveryMode } from '../enums/delivery-mode.enum.js';

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_CLASS_STUDENTS = 1000;
export const MEETING_URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true };

export class CreateClassDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  readonly courseId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'An active user with the MENTOR role' })
  @IsUUID('4')
  readonly mentorId!: string;

  @ApiProperty({ type: String, example: 'WEB101-2026A', minLength: 2, maxLength: 50 })
  @IsString()
  @Length(2, 50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, {
    message: 'code must contain letters, digits, hyphens or underscores only',
  })
  readonly code!: string;

  @ApiProperty({ type: String, example: 'Web 101 — evening class', maxLength: 250 })
  @IsString()
  @Length(1, 250)
  readonly name!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-02' })
  @Matches(DATE_ONLY_PATTERN, { message: 'startDate must be a YYYY-MM-DD date' })
  @IsISO8601({ strict: true })
  readonly startDate!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-12-25' })
  @Matches(DATE_ONLY_PATTERN, { message: 'endDate must be a YYYY-MM-DD date' })
  @IsISO8601({ strict: true })
  readonly endDate!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: MAX_CLASS_STUDENTS, example: 20 })
  @IsInt()
  @Min(1)
  @Max(MAX_CLASS_STUDENTS)
  readonly maxStudents!: number;

  @ApiProperty({ type: String, enum: DeliveryMode, example: DeliveryMode.ONLINE })
  @IsEnum(DeliveryMode)
  readonly deliveryMode!: DeliveryMode;

  @ApiPropertyOptional({ type: String, format: 'uri', maxLength: 2048 })
  @IsOptional()
  @IsUrl(MEETING_URL_OPTIONS)
  @MaxLength(2048)
  readonly meetingUrl?: string;
}
