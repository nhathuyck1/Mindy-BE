import { ApiProperty } from '@nestjs/swagger';
import { TeachingMentorDto } from '../../classes/dtos/teaching.dto.js';
import { SessionStatus } from '../../classes/enums/session-status.enum.js';
import { AttendanceAdmissionBasis } from '../enums/attendance-admission-basis.enum.js';
import { AttendanceStatus } from '../enums/attendance-status.enum.js';

export class AttendanceRecoveryEvidenceDto {
  @ApiProperty({ type: String }) readonly evidenceNote!: string;
  @ApiProperty({ enum: AttendanceAdmissionBasis })
  readonly admissionBasis!: AttendanceAdmissionBasis;
  @ApiProperty({ type: String, format: 'date-time' }) readonly paidAt!: Date;
  @ApiProperty({ enum: SessionStatus }) readonly oldSessionStatus!: SessionStatus;
  @ApiProperty({ enum: SessionStatus }) readonly newSessionStatus!: SessionStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly oldActualStartedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) readonly newActualStartedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly oldActualEndedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) readonly newActualEndedAt!: Date;
}

export class AttendanceAuditDto {
  @ApiProperty({ enum: ['REGULAR', 'MAKEUP'] }) readonly entryType!: 'REGULAR' | 'MAKEUP';
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly makeupPlacementId!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'uuid' }) readonly id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly attendanceId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly enrollmentId!: string;
  @ApiProperty({ type: () => TeachingMentorDto }) readonly actor!: TeachingMentorDto;
  @ApiProperty({ enum: AttendanceStatus, nullable: true })
  readonly oldStatus!: AttendanceStatus | null;
  @ApiProperty({ enum: AttendanceStatus }) readonly newStatus!: AttendanceStatus;
  @ApiProperty({ type: String, nullable: true }) readonly reason!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) readonly occurredAt!: Date;
  @ApiProperty({ enum: ['ADMIT', 'MARK', 'FINALIZE', 'CORRECT', 'RECOVER'] })
  readonly action!: string;
  @ApiProperty({ type: Number }) readonly version!: number;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly recoveryAuditId!:
    | string
    | null;
  @ApiProperty({ type: () => AttendanceRecoveryEvidenceDto, nullable: true })
  readonly recoveryEvidence!: AttendanceRecoveryEvidenceDto | null;
}

export class AttendanceAuditPageDto {
  @ApiProperty({ type: () => AttendanceAuditDto, isArray: true })
  readonly items!: AttendanceAuditDto[];
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: Number }) readonly total!: number;
}
