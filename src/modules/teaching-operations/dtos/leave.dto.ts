import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { TeachingSessionDto } from '../../classes/dtos/teaching.dto.js';
import { LEAVE_PERIODS, type LeavePeriod } from '../domain/leave-calendar.js';

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export class LeavePreviewInput {
  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  readonly fromDate!: string;
  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  readonly toDate!: string;
  @ApiProperty({ enum: LEAVE_PERIODS })
  @IsIn(LEAVE_PERIODS)
  readonly period!: LeavePeriod;
}
export class LeaveSourceVersion {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  readonly sessionId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) readonly version!: number;
}
export class LeaveDayMapping {
  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  readonly sourceDate!: string;
  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  readonly targetDate!: string;
}
export class LeaveSessionMapping {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  readonly sourceSessionId!: string;
  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  readonly targetDate!: string;
  @ApiProperty({ enum: LEAVE_PERIODS.slice(0, 3) })
  @IsIn(LEAVE_PERIODS.slice(0, 3))
  readonly targetPeriod!: LeavePeriod;
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly startsAt!: string;
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly endsAt!: string;
}
export class CreateLeaveInput extends LeavePreviewInput {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  readonly reason!: string;
  @ApiProperty({ type: [LeaveSourceVersion], maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LeaveSourceVersion)
  readonly sourceVersions!: LeaveSourceVersion[];
  @ApiPropertyOptional({ type: [LeaveDayMapping] })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsArray()
  @ArrayMaxSize(93)
  @ValidateNested({ each: true })
  @Type(() => LeaveDayMapping)
  readonly dayMappings?: LeaveDayMapping[];
  @ApiPropertyOptional({ type: [LeaveSessionMapping] })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LeaveSessionMapping)
  readonly sessionMappings?: LeaveSessionMapping[];
}
export class LeaveMutationInput {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) readonly expectedVersion!: number;
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  readonly reason!: string;
}
export class ApproveLeaveInput extends LeaveMutationInput {
  @ApiProperty() @IsBoolean() readonly acknowledgeStudentConflicts!: boolean;
}
export class LeaveSlotsInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') readonly sourceSessionId!: string;
  @ApiProperty({ format: 'date' })
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  readonly targetDate!: string;
  @ApiProperty({ enum: LEAVE_PERIODS.slice(0, 3) })
  @IsIn(LEAVE_PERIODS.slice(0, 3))
  readonly targetPeriod!: LeavePeriod;
}
export class LeaveListQuery extends PageOptionsDto {
  @ApiPropertyOptional({ enum: LEAVE_STATUSES })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsIn(LEAVE_STATUSES)
  readonly status?: LeaveStatus;
}
export class ManagementLeaveListQuery extends LeaveListQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsUUID('4')
  readonly mentorId?: string;
}
export class LeavePreviewDto {
  @ApiProperty({ type: [TeachingSessionDto] }) readonly affectedSessions!: TeachingSessionDto[];
  @ApiProperty({ type: [LeaveSourceVersion] }) readonly sourceVersions!: LeaveSourceVersion[];
  @ApiProperty() readonly noticeEligible!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly noticeDeadline!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf!: Date;
  @ApiProperty() readonly timeZone!: string;
}
export class LeaveSlotDto {
  @ApiProperty({ type: String, format: 'date-time' }) readonly startsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) readonly endsAt!: Date;
}
export class LeaveSlotsDto {
  @ApiProperty({ type: [LeaveSlotDto] }) readonly slots!: LeaveSlotDto[];
  @ApiProperty() readonly sessionVersion!: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf!: Date;
  @ApiProperty() readonly timeZone!: string;
}
export class LeaveItemDto extends LeaveSlotDto {
  @ApiProperty({ format: 'uuid' }) readonly sourceSessionId!: string;
  @ApiProperty({ format: 'uuid' }) readonly classId!: string;
  @ApiProperty() readonly sourceVersion!: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly sourceStartsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) readonly sourceEndsAt!: Date;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly replacementSessionId!:
    | string
    | null;
}
export class LeaveExtensionDto {
  @ApiProperty({ format: 'uuid' }) readonly classId!: string;
  @ApiProperty({ format: 'date' }) readonly endDate!: string;
}
export class LeaveReviewDto {
  @ApiProperty({ format: 'uuid' }) readonly reviewerId!: string;
  @ApiProperty() readonly reason!: string;
  @ApiProperty({ type: String, format: 'date-time' }) readonly reviewedAt!: Date;
}
export class LeaveStudentConflictDto {
  @ApiProperty({ format: 'uuid' }) readonly sourceSessionId!: string;
  @ApiProperty({ format: 'uuid' }) readonly studentId!: string;
  @ApiProperty({ format: 'uuid' }) readonly conflictingSessionId!: string;
}
export class LeaveRequestDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Current detail preview only; null on list/mutation responses',
  })
  readonly studentConflictCount!: number | null;
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ format: 'uuid' }) readonly mentorId!: string;
  @ApiProperty({ format: 'date' }) readonly fromDate!: string;
  @ApiProperty({ format: 'date' }) readonly toDate!: string;
  @ApiProperty({ enum: LEAVE_PERIODS }) readonly period!: LeavePeriod;
  @ApiProperty() readonly reason!: string;
  @ApiProperty({ enum: LEAVE_STATUSES }) readonly status!: LeaveStatus;
  @ApiProperty() readonly version!: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly submittedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) readonly expiresAt!: Date;
  @ApiProperty() readonly itemCount!: number;
  @ApiProperty({ type: [LeaveItemDto] }) readonly items!: LeaveItemDto[];
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
  @ApiProperty({ type: [LeaveExtensionDto] }) readonly classExtensions!: LeaveExtensionDto[];
  @ApiProperty({ type: LeaveReviewDto, nullable: true }) readonly review!: LeaveReviewDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf!: Date;
  @ApiProperty() readonly timeZone!: string;
}
export class LeaveRequestPageDto {
  @ApiProperty({ type: [LeaveRequestDto] }) readonly items!: LeaveRequestDto[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf!: Date;
}
export class LeaveApprovalDto {
  @ApiProperty({ type: LeaveRequestDto }) readonly request!: LeaveRequestDto;
  @ApiProperty({ type: [TeachingSessionDto] }) readonly replacements!: TeachingSessionDto[];
  @ApiProperty({ type: [LeaveExtensionDto] }) readonly classExtensions!: LeaveExtensionDto[];
  @ApiProperty() readonly studentConflictCount!: number;
}
export class ManagementLeaveDetailDto extends LeaveRequestDto {
  @ApiProperty({ type: [LeaveStudentConflictDto] })
  readonly studentConflicts!: LeaveStudentConflictDto[];
  @ApiProperty() readonly studentConflictCount!: number;
  @ApiProperty() readonly sourcesCurrent!: boolean;
}
