import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PageOptionsDto } from '../../common/dtos/page-options.dto.js';

export const TRACKING_SOURCES = [
  'material_audit_events',
  'teaching_assignment_audits',
  'session_lifecycle_audits',
  'session_schedule_audits',
  'attendance_audits',
  'guest_attendance_audits',
  'makeup_placement_audits',
  'mentor_leave_audits',
  'teaching_note_audits',
  'class_unit_release_audit',
  'session_meeting_audits',
  'attendance_recovery_audits',
] as const;
export class TrackingQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: TRACKING_SOURCES })
  @IsOptional()
  @IsIn(TRACKING_SOURCES)
  readonly source?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') readonly actorId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') readonly entityId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') readonly classId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') readonly sessionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) readonly action?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly from?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly to?: string;
}
export class TrackingEventDto {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ enum: TRACKING_SOURCES }) readonly source!: string;
  @ApiProperty() readonly action!: string;
  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Current actor display name; null for system events',
  })
  readonly actor!: { id: string; displayName: string | null } | null;
  @ApiProperty() readonly entityType!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly entityId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly classId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) readonly sessionId!: string | null;
  @ApiProperty({ type: Number, nullable: true }) readonly version!: number | null;
  @ApiProperty({ type: String, nullable: true }) readonly reason!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) readonly occurredAt!: Date;
}
export class TrackingPageDto {
  @ApiProperty({ type: () => TrackingEventDto, isArray: true }) readonly items!: TrackingEventDto[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
}
export class TrackingDetailDto extends TrackingEventDto {
  @ApiProperty({
    type: Object,
    description:
      'Original event fields; historical sources may not include a full before/after snapshot',
  })
  readonly data!: Record<string, unknown>;
  @ApiProperty({
    type: Object,
    isArray: true,
    description: 'Recovery evidence items, only populated for attendance recovery',
  })
  readonly evidenceItems!: Record<string, unknown>[];
}
