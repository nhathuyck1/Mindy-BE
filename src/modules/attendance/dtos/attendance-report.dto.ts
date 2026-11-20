import { ApiProperty } from '@nestjs/swagger';
import { TeachingMentorDto, TeachingSessionDto } from '../../classes/dtos/teaching.dto.js';
import { SessionStatus } from '../../classes/enums/session-status.enum.js';
import {
  ATTENDANCE_APPLICABILITIES,
  type AttendanceApplicability,
  type CreditedStatus,
} from '../domain/attendance-credit.js';
import { AttendanceStatus } from '../enums/attendance-status.enum.js';
import { INCOMPLETE_ISSUES, type IncompleteIssue } from './attendance-report-query.dto.js';

export class AttendanceCountsDto {
  @ApiProperty({ type: Number }) readonly present!: number;
  @ApiProperty({ type: Number }) readonly absent!: number;
  @ApiProperty({ type: Number }) readonly unmarked!: number;
  @ApiProperty({ type: Number }) readonly excluded!: number;
  @ApiProperty({ type: Number }) readonly makeupPending!: number;
  @ApiProperty({ type: Number }) readonly finalizedEligibleCount!: number;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 100 }) readonly rate!:
    | number
    | null;
}
export class AttendanceSummaryDto extends AttendanceCountsDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly classId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf!: Date;
  @ApiProperty({ type: String }) readonly timeZone!: string;
}
export class AttendanceHistoryItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly sessionId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly enrollmentId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly rootSessionId!: string;
  @ApiProperty({ type: String }) readonly title!: string;
  @ApiProperty({ type: String, format: 'date-time' }) readonly startsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) readonly endsAt!: Date;
  @ApiProperty({ enum: SessionStatus }) readonly sessionStatus!: SessionStatus;
  @ApiProperty({ enum: AttendanceStatus, nullable: true })
  readonly attendanceStatus!: AttendanceStatus | null;
  @ApiProperty({ enum: ATTENDANCE_APPLICABILITIES })
  readonly attendanceApplicability!: AttendanceApplicability;
  @ApiProperty({ type: Boolean }) readonly excluded!: boolean;
  @ApiProperty({ type: () => TeachingMentorDto, nullable: true })
  readonly effectiveMentor!: TeachingMentorDto | null;
  @ApiProperty({ enum: ['PRIMARY', 'SUBSTITUTE'] }) readonly assignmentType!:
    | 'PRIMARY'
    | 'SUBSTITUTE';
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly makeupForSessionId!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly makeupRootSessionId!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly makeupPlacementId!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly creditSessionId!:
    | string
    | null;
  @ApiProperty({ enum: ['PRESENT', 'ABSENT'], nullable: true })
  readonly creditedAttendanceStatus!: CreditedStatus | null;
}
export class AttendanceHistoryPageDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly classId!: string;
  @ApiProperty({ type: () => AttendanceHistoryItemDto, isArray: true })
  readonly items!: AttendanceHistoryItemDto[];
  @ApiProperty({ type: Number }) readonly total!: number;
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf!: Date;
  @ApiProperty({ type: String }) readonly timeZone!: string;
}
export class EnrollmentAttendanceSummaryDto extends AttendanceCountsDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly enrollmentId!: string;
  @ApiProperty({ type: () => TeachingMentorDto }) readonly student!: TeachingMentorDto;
}
export class ClassAttendanceSummaryPageDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly classId!: string;
  @ApiProperty({ type: () => EnrollmentAttendanceSummaryDto, isArray: true })
  readonly items!: EnrollmentAttendanceSummaryDto[];
  @ApiProperty({ type: Number }) readonly total!: number;
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf!: Date;
  @ApiProperty({ type: String }) readonly timeZone!: string;
}
export class IncompleteSessionDto {
  @ApiProperty({ type: () => TeachingSessionDto }) readonly session!: TeachingSessionDto;
  @ApiProperty({ enum: INCOMPLETE_ISSUES }) readonly issue!: IncompleteIssue;
  @ApiProperty({ type: Boolean, nullable: true }) readonly deadlineExpired!: boolean | null;
}
export class IncompleteSessionPageDto {
  @ApiProperty({ type: () => IncompleteSessionDto, isArray: true })
  readonly items!: IncompleteSessionDto[];
  @ApiProperty({ type: Number }) readonly total!: number;
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly asOf!: Date;
  @ApiProperty({ type: String }) readonly timeZone!: string;
}
