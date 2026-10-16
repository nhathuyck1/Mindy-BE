import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { TeachingMentorDto, TeachingSessionDto } from '../../classes/dtos/teaching.dto.js';
import { AttendanceStatus } from '../enums/attendance-status.enum.js';

export const PLACEMENT_STATUSES = [
  'ASSIGNED',
  'COMPLETED',
  'CANCELLED',
  'NEEDS_REASSIGNMENT',
] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];
export type ConflictStatus = 'OPEN' | 'MAKEUP_ASSIGNED' | 'RESOLVED';

export class MakeupMutationDto {
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
export class CreateMakeupPlacementDto extends MakeupMutationDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID('4')
  readonly targetSessionId!: string;
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  readonly expectedTargetVersion!: number;
  @ApiProperty({ type: Boolean, enum: [true] })
  @Equals(true)
  readonly contentMatchConfirmed!: boolean;
}
export class MakeupCandidatesQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly from?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly to?: string;
}
export class MakeupListQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: PLACEMENT_STATUSES })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsIn(PLACEMENT_STATUSES)
  readonly status?: PlacementStatus;
}
export class ScheduleConflictsQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsUUID('4')
  readonly classId?: string;
  @ApiPropertyOptional({ enum: ['OPEN', 'MAKEUP_ASSIGNED', 'RESOLVED'] })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsIn(['OPEN', 'MAKEUP_ASSIGNED', 'RESOLVED'])
  readonly status?: ConflictStatus;
}
export class ConflictingIntervalDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly sessionId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) readonly startsAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) readonly endsAt!: string;
}
export class ScheduleConflictDto {
  @ApiProperty({ type: Number, nullable: true }) readonly makeupPlacementVersion!: number | null;
  @ApiProperty({ type: String, format: 'uuid' }) readonly id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly enrollmentId!: string;
  @ApiProperty({ type: () => TeachingMentorDto }) readonly student!: TeachingMentorDto;
  @ApiProperty({ type: () => TeachingSessionDto }) readonly sourceSession!: TeachingSessionDto;
  @ApiProperty({ type: () => ConflictingIntervalDto, isArray: true })
  readonly conflictingIntervals!: ConflictingIntervalDto[];
  @ApiProperty({ enum: ['OPEN', 'MAKEUP_ASSIGNED', 'RESOLVED'] }) readonly status!: ConflictStatus;
  @ApiProperty({ type: Number }) readonly version!: number;
  @ApiProperty({ type: String, nullable: true }) readonly makeupPlacementId!: string | null;
}
export class ScheduleConflictPageDto {
  @ApiProperty({ type: () => ScheduleConflictDto, isArray: true })
  readonly items!: ScheduleConflictDto[];
  @ApiProperty({ type: Number }) readonly total!: number;
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf!: Date;
}
export class MakeupCandidateDto {
  @ApiProperty({ type: () => TeachingSessionDto }) readonly session!: TeachingSessionDto;
  @ApiProperty({ type: Number }) readonly remainingCapacity!: number;
}
export class MakeupCandidatePageDto {
  @ApiProperty({ type: () => MakeupCandidateDto, isArray: true })
  readonly items!: MakeupCandidateDto[];
  @ApiProperty({ type: Number }) readonly total!: number;
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf!: Date;
}
export class MakeupPlacementDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly conflictId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly enrollmentId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly sourceClassId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly sourceSessionId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly sourceRootSessionId!: string;
  @ApiProperty({ type: () => TeachingSessionDto }) readonly targetSession!: TeachingSessionDto;
  @ApiProperty({ enum: PLACEMENT_STATUSES }) readonly status!: PlacementStatus;
  @ApiProperty({ type: Number }) readonly version!: number;
  @ApiProperty({ enum: AttendanceStatus, nullable: true })
  readonly attendanceStatus!: AttendanceStatus | null;
  @ApiProperty({ enum: ['PENDING', 'FINALIZED', 'REVOKED'] }) readonly creditStatus!:
    | 'PENDING'
    | 'FINALIZED'
    | 'REVOKED';
}
export class MakeupPlacementPageDto {
  @ApiProperty({ type: () => MakeupPlacementDto, isArray: true })
  readonly items!: MakeupPlacementDto[];
  @ApiProperty({ type: Number }) readonly total!: number;
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf!: Date;
  @ApiProperty({ type: String }) readonly timeZone!: string;
}
export class MakeupPlacementCreatedDto {
  @ApiProperty({ type: () => MakeupPlacementDto }) readonly placement!: MakeupPlacementDto;
  @ApiProperty({ type: Number }) readonly conflictVersion!: number;
  @ApiProperty({ type: Number }) readonly targetSessionVersion!: number;
}
