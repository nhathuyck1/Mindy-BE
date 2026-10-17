import { ApiProperty } from '@nestjs/swagger';
import { ClassStatus } from '../enums/class-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';

export class TeachingMentorDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ type: String, nullable: true })
  readonly displayName!: string | null;
}

export class TeachingSessionDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  readonly makeupForSessionId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  readonly makeupRootSessionId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly actualStartedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly actualEndedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly editableUntil!: Date | null;
  @ApiProperty({ type: String, format: 'uuid' })
  readonly sessionId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  readonly classId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  readonly classUnitId!: string;

  @ApiProperty({ type: String })
  readonly title!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly startsAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly endsAt!: Date;

  @ApiProperty({ enum: SessionStatus })
  readonly status!: SessionStatus;

  @ApiProperty({ type: () => TeachingMentorDto })
  readonly primaryMentor!: TeachingMentorDto;

  @ApiProperty({ type: () => TeachingMentorDto, nullable: true })
  readonly effectiveMentor!: TeachingMentorDto | null;

  @ApiProperty({ enum: ['PRIMARY', 'SUBSTITUTE'] })
  readonly assignmentType!: 'PRIMARY' | 'SUBSTITUTE';

  @ApiProperty({ type: Number })
  readonly version!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly asOf!: Date;

  @ApiProperty({ type: String })
  readonly timeZone!: string;
}

export class TeachingClassDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ type: String })
  readonly code!: string;

  @ApiProperty({ type: String })
  readonly name!: string;

  @ApiProperty({ enum: ClassStatus })
  readonly status!: ClassStatus;

  @ApiProperty({ type: () => TeachingMentorDto })
  readonly primaryMentor!: TeachingMentorDto;

  @ApiProperty({ type: Number })
  readonly assignmentVersion!: number;
}

export class MentorCandidateDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ type: String })
  readonly displayName!: string;

  @ApiProperty({ type: Boolean })
  readonly isCurrent!: boolean;
}

export class TeachingClassPageDto {
  @ApiProperty({ type: () => TeachingClassDto, isArray: true })
  readonly items!: TeachingClassDto[];

  @ApiProperty({ type: Number })
  readonly page!: number;

  @ApiProperty({ type: Number })
  readonly pageSize!: number;

  @ApiProperty({ type: Number })
  readonly total!: number;
}

export class TeachingSessionPageDto {
  @ApiProperty({ type: () => TeachingSessionDto, isArray: true })
  readonly items!: TeachingSessionDto[];

  @ApiProperty({ type: Number })
  readonly page!: number;

  @ApiProperty({ type: Number })
  readonly pageSize!: number;

  @ApiProperty({ type: Number })
  readonly total!: number;
}

export class TeachingClassDetailDto {
  @ApiProperty({ type: () => TeachingClassDto })
  readonly class!: TeachingClassDto;

  @ApiProperty({ type: () => TeachingSessionPageDto })
  readonly sessions!: TeachingSessionPageDto;
}

export class MentorCandidatesPageDto {
  @ApiProperty({ type: () => MentorCandidateDto, isArray: true })
  readonly items!: MentorCandidateDto[];

  @ApiProperty({ type: Number })
  readonly page!: number;

  @ApiProperty({ type: Number })
  readonly pageSize!: number;

  @ApiProperty({ type: Number })
  readonly total!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly asOf!: Date;

  @ApiProperty({ type: String })
  readonly timeZone!: string;

  @ApiProperty({ enum: ['TEACHING_SCHEDULE_AND_APPROVED_LEAVE'] })
  readonly availabilityBasis!: 'TEACHING_SCHEDULE_AND_APPROVED_LEAVE';
}

export class SessionMentorCandidatesDto extends MentorCandidatesPageDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly sessionId!: string;

  @ApiProperty({ type: Number })
  readonly sessionVersion!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly checkedFrom!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly checkedTo!: Date;
}

export class ClassMentorCandidatesDto extends MentorCandidatesPageDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly classId!: string;

  @ApiProperty({ type: Number })
  readonly assignmentVersion!: number;

  @ApiProperty({ type: Number })
  readonly affectedSessionCount!: number;
}

export class ClassMentorAssignmentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly classId!: string;

  @ApiProperty({ type: () => TeachingMentorDto })
  readonly primaryMentor!: TeachingMentorDto;

  @ApiProperty({ type: Number })
  readonly assignmentVersion!: number;

  @ApiProperty({ type: Number })
  readonly affectedSessionCount!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly asOf!: Date;
}

export class MentorTeachingScheduleDto extends TeachingSessionPageDto {
  @ApiProperty({ type: String, format: 'date-time' })
  readonly from!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly to!: Date;

  @ApiProperty({ type: String })
  readonly timeZone!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly asOf!: Date;
}

export class TeachingSessionContextDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  readonly makeupPlacementId!: string | null;
  @ApiProperty({ type: () => TeachingSessionDto })
  readonly session!: TeachingSessionDto;

  @ApiProperty({ type: String, nullable: true })
  readonly roomName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  readonly meetingUrl!: string | null;

  @ApiProperty({ enum: ['SESSION'] })
  readonly accessScope!: 'SESSION';
}
