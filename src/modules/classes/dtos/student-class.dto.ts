import { ApiProperty } from '@nestjs/swagger';
import type { ClassDetailView, ClassUnitView } from '../domain/class-views.js';
import type { ClassSessionEntity } from '../entities/class-session.entity.js';
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

/** Current learning scope: class/unit timetable and private class meeting URL. */
export class StudentClassDto extends ClassDto {
  @ApiProperty({ type: () => StudentUnitDto, isArray: true }) readonly units: StudentUnitDto[];
  @ApiProperty({ type: String, nullable: true, format: 'uri' }) readonly meetingUrl: string | null;
  constructor(view: ClassDetailView) {
    super(view);
    this.units = view.units.map((unit) => new StudentUnitDto(unit));
    this.meetingUrl = view.classEntity.meetingUrl;
  }
}
