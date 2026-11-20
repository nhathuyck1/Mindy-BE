import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import type { ClassUnitView, StudentClassView } from '../domain/class-views.js';
import type { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { ClassDto, ClassSessionDto, ClassUnitDto } from './class.dto.js';

export class StudentSessionDto extends ClassSessionDto {
  @ApiProperty({ type: String, nullable: true, format: 'uri' }) readonly meetingUrl: string | null;
  constructor(session: ClassSessionEntity) {
    super(session);
    this.meetingUrl = session.meetingUrl;
  }
}
export class StudentUnitDto extends ClassUnitDto {
  @ApiProperty({ type: () => StudentSessionDto, isArray: true })
  readonly sessions: StudentSessionDto[];
  constructor(view: ClassUnitView) {
    super(view);
    this.sessions = view.sessions.map((s) => new StudentSessionDto(s));
  }
}

/**
 * Current learning scope: class/unit timetable and private class meeting URL. The enrollment
 * context fields were added in Phase 2.3 without changing the earlier fields.
 */
export class StudentClassDto extends ClassDto {
  @ApiProperty({ type: () => StudentUnitDto, isArray: true }) readonly units: StudentUnitDto[];
  @ApiProperty({ type: String, nullable: true, format: 'uri' }) readonly meetingUrl: string | null;
  @ApiProperty({ type: String, enum: ClassStatus }) readonly classStatus: ClassStatus;
  @ApiProperty({ type: String, format: 'uuid' }) readonly enrollmentId: string;
  @ApiProperty({ type: String, enum: EnrollmentStatus, example: EnrollmentStatus.ACTIVE })
  readonly enrollmentStatus: EnrollmentStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly enrolledAt: Date | null;
  @ApiProperty({
    type: String,
    enum: ['FULL'],
    description: 'Same value as accessMode in GET /me/classes for this endpoint',
  })
  readonly accessMode: 'FULL';
  constructor(view: StudentClassView) {
    super(view);
    this.units = view.units.map((unit) => new StudentUnitDto(unit));
    this.meetingUrl = view.classEntity.meetingUrl;
    this.classStatus = view.classEntity.status;
    this.enrollmentId = view.enrollment.id;
    this.enrollmentStatus = view.enrollment.status;
    this.enrolledAt = view.enrollment.enrolledAt;
    this.accessMode = 'FULL';
  }
}
