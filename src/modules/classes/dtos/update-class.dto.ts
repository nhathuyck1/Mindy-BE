import { ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateIf,
} from 'class-validator';

import { DeliveryMode } from '../enums/delivery-mode.enum.js';
import { DATE_ONLY_PATTERN, MAX_CLASS_STUDENTS, MEETING_URL_OPTIONS } from './create-class.dto.js';

const isProvided = (_object: unknown, value: unknown): boolean => value !== undefined;

/**
 * A DRAFT class accepts every field. Once the class is OPEN or IN_PROGRESS only `name`,
 * `mentorId` and `meetingUrl` may change. Status changes use the dedicated commands.
 */
export class UpdateClassDto {
  @ApiPropertyOptional({ type: String, maxLength: 250 })
  @ValidateIf(isProvided)
  @IsString()
  @Length(1, 250)
  readonly name?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf(isProvided)
  @IsUUID('4')
  readonly mentorId?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @ValidateIf(isProvided)
  @Matches(DATE_ONLY_PATTERN, { message: 'startDate must be a YYYY-MM-DD date' })
  @IsISO8601({ strict: true })
  readonly startDate?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @ValidateIf(isProvided)
  @Matches(DATE_ONLY_PATTERN, { message: 'endDate must be a YYYY-MM-DD date' })
  @IsISO8601({ strict: true })
  readonly endDate?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: MAX_CLASS_STUDENTS })
  @ValidateIf(isProvided)
  @IsInt()
  @Min(1)
  @Max(MAX_CLASS_STUDENTS)
  readonly maxStudents?: number;

  @ApiPropertyOptional({ type: String, enum: DeliveryMode })
  @ValidateIf(isProvided)
  @IsEnum(DeliveryMode)
  readonly deliveryMode?: DeliveryMode;

  @ApiPropertyOptional({
    type: String,
    format: 'uri',
    nullable: true,
    maxLength: 2048,
    description: 'Send null to clear the meeting URL',
  })
  @IsOptional()
  @IsUrl(MEETING_URL_OPTIONS)
  @MaxLength(2048)
  readonly meetingUrl?: string | null;
}
