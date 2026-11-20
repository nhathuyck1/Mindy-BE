import { ApiProperty } from '@nestjs/swagger';
import { TeachingMentorDto, TeachingSessionDto } from '../../classes/dtos/teaching.dto.js';
import { AttendanceStatus } from '../enums/attendance-status.enum.js';

export class AttendancePermissionsDto {
  @ApiProperty({ type: Boolean })
  readonly canStart!: boolean;

  @ApiProperty({ type: Boolean })
  readonly canEditAttendance!: boolean;

  @ApiProperty({ type: Boolean })
  readonly canFinalize!: boolean;

  @ApiProperty({ type: Boolean })
  readonly canSyncRoster!: boolean;

  @ApiProperty({ type: Boolean })
  readonly canRecover!: boolean;

  @ApiProperty({ type: Boolean })
  readonly canViewAttendanceAudits!: boolean;
}
export class AttendanceSessionDto extends TeachingSessionDto {
  @ApiProperty({ type: () => AttendancePermissionsDto })
  readonly permissions!: AttendancePermissionsDto;
}
export class AttendanceTotalsDto {
  @ApiProperty({ type: Number })
  readonly present!: number;

  @ApiProperty({ type: Number })
  readonly absent!: number;

  @ApiProperty({ type: Number })
  readonly unmarked!: number;

  @ApiProperty({ type: Number })
  readonly eligible!: number;
}
export class AttendanceItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly attendanceId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  readonly enrollmentId!: string;

  @ApiProperty({ enum: ['REGULAR', 'MAKEUP'] })
  readonly entryType!: 'REGULAR' | 'MAKEUP';

  @ApiProperty({ type: String, nullable: true })
  readonly makeupPlacementId!: string | null;

  @ApiProperty({ type: () => TeachingMentorDto })
  readonly student!: TeachingMentorDto;

  @ApiProperty({ enum: AttendanceStatus })
  readonly status!: AttendanceStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly checkedInAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly admittedAt!: Date;
}
export class AttendanceWriteDto {
  @ApiProperty({ type: () => AttendanceSessionDto })
  readonly session!: AttendanceSessionDto;

  @ApiProperty({ type: () => AttendanceTotalsDto })
  readonly totals!: AttendanceTotalsDto;

  @ApiProperty({ type: String, isArray: true })
  readonly changedEnrollmentIds!: string[];

  @ApiProperty({ type: String, isArray: true })
  readonly changedMakeupPlacementIds!: string[];
}
export class AttendanceRosterDto {
  @ApiProperty({ type: () => AttendanceSessionDto })
  readonly session!: AttendanceSessionDto;

  @ApiProperty({ type: () => AttendanceTotalsDto })
  readonly totals!: AttendanceTotalsDto;

  @ApiProperty({ type: () => AttendanceItemDto, isArray: true })
  readonly items!: AttendanceItemDto[];

  @ApiProperty({ type: Number })
  readonly page!: number;

  @ApiProperty({ type: Number })
  readonly pageSize!: number;

  @ApiProperty({ type: Number })
  readonly total!: number;

  @ApiProperty({ type: Number })
  readonly pendingPaymentCount!: number;
}

export class AttendanceCandidateDto {
  @ApiProperty({ format: 'uuid' }) readonly enrollmentId!: string;
  @ApiProperty({ type: () => TeachingMentorDto }) readonly student!: TeachingMentorDto;
  @ApiProperty({ enum: ['REGULAR', 'MAKEUP'] }) readonly entryType!: 'REGULAR' | 'MAKEUP';
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly makeupPlacementId!:
    | string
    | null;
}
export class AttendanceCandidatePageDto {
  @ApiProperty({ type: () => AttendanceCandidateDto, isArray: true })
  readonly items!: AttendanceCandidateDto[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
  @ApiProperty({
    description: 'Preview only; start rechecks eligibility and creates the actual snapshot',
  })
  readonly provisional!: boolean;
  @ApiProperty() readonly asOf!: Date;
}
