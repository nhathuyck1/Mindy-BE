import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ZONED_TIMESTAMP_PATTERN } from '../../student-learning/domain/schedule-range.js';
import { ClassStatus } from '../enums/class-status.enum.js';

export class ManagementClassesQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: ClassStatus })
  @IsOptional()
  @IsEnum(ClassStatus)
  readonly status?: ClassStatus;
}

export class MentorCandidatesQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 100)
  readonly search?: string;
}

export class MentorScheduleQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((o: MentorScheduleQueryDto) => o.from !== undefined || o.to !== undefined)
  @IsISO8601({ strict: true })
  @Matches(ZONED_TIMESTAMP_PATTERN)
  readonly from?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((o: MentorScheduleQueryDto) => o.from !== undefined || o.to !== undefined)
  @IsISO8601({ strict: true })
  @Matches(ZONED_TIMESTAMP_PATTERN)
  readonly to?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly classId?: string;
}

export class AssignClassMentorDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  readonly mentorId!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  readonly reason!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  readonly expectedVersion!: number;
}

export class AssignSessionMentorDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_o: unknown, value: unknown) => value !== null)
  @IsUUID('4')
  readonly mentorId!: string | null;

  @ApiProperty({ type: String, minLength: 1, maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  readonly reason!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  readonly expectedVersion!: number;
}
