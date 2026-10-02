import { ApiProperty } from '@nestjs/swagger';
import type { ClassDetailView, ClassUnitView, ClassView } from '../domain/class-views.js';
import type { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { ClassUnitStatus } from '../enums/class-unit-status.enum.js';
import { DeliveryMode } from '../enums/delivery-mode.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';

export class ClassMentorDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: String, nullable: true })
  readonly displayName: string | null;

  constructor(id: string, displayName: string | null) {
    this.id = id;
    this.displayName = displayName;
  }
}

/** Public class summary. Never carries the meeting URL. */
export class ClassDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  readonly courseId: string;

  @ApiProperty({ type: String, example: 'WEB101-2026A' })
  readonly code: string;

  @ApiProperty({ type: String })
  readonly name: string;

  @ApiProperty({ type: String, format: 'date' })
  readonly startDate: string;

  @ApiProperty({ type: String, format: 'date' })
  readonly endDate: string;

  @ApiProperty({ type: String, enum: DeliveryMode })
  readonly deliveryMode: DeliveryMode;

  @ApiProperty({ type: Number, example: 20 })
  readonly maxStudents: number;

  @ApiProperty({ type: Number, example: 5, description: 'Seats not held or enrolled yet' })
  readonly availableSeats: number;

  @ApiProperty({ type: () => ClassMentorDto })
  readonly mentor: ClassMentorDto;

  constructor(view: ClassView) {
    const { classEntity } = view;
    this.id = classEntity.id;
    this.courseId = classEntity.courseId;
    this.code = classEntity.code;
    this.name = classEntity.name;
    this.startDate = classEntity.startDate;
    this.endDate = classEntity.endDate;
    this.deliveryMode = classEntity.deliveryMode;
    this.maxStudents = classEntity.maxStudents;
    this.availableSeats = Math.max(classEntity.maxStudents - view.occupiedSeats, 0);
    this.mentor = new ClassMentorDto(classEntity.mentorId, view.mentorName);
  }
}

export class ClassPageDto {
  @ApiProperty({ type: () => ClassDto, isArray: true })
  readonly items: ClassDto[];

  @ApiProperty({ type: Number, example: 1 })
  readonly page: number;

  @ApiProperty({ type: Number, example: 20 })
  readonly pageSize: number;

  @ApiProperty({ type: Number, example: 42 })
  readonly total: number;

  constructor(items: ClassDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}

/** Public timetable entry: title, time and room only. */
export class ClassSessionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: Number, example: 1 })
  readonly sessionNumber: number;

  @ApiProperty({ type: String })
  readonly title: string;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly startsAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly endsAt: Date;

  @ApiProperty({ type: String, nullable: true })
  readonly roomName: string | null;

  @ApiProperty({ type: String, enum: SessionStatus })
  readonly status: SessionStatus;

  constructor(session: ClassSessionEntity) {
    this.id = session.id;
    this.sessionNumber = session.sessionNumber;
    this.title = session.title;
    this.startsAt = session.startsAt;
    this.endsAt = session.endsAt;
    this.roomName = session.roomName;
    this.status = session.status;
  }
}

export class ClassUnitDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: Number, example: 1 })
  readonly position: number;

  @ApiProperty({ type: String })
  readonly title: string;

  @ApiProperty({ type: () => ClassSessionDto, isArray: true })
  readonly sessions: ClassSessionDto[];

  constructor(view: ClassUnitView) {
    this.id = view.unit.id;
    this.position = view.unit.position;
    this.title = view.title;
    this.sessions = view.sessions.map((session) => new ClassSessionDto(session));
  }
}

export class ClassDetailDto extends ClassDto {
  @ApiProperty({ type: () => ClassUnitDto, isArray: true })
  readonly units: ClassUnitDto[];

  constructor(view: ClassDetailView) {
    super(view);
    this.units = view.units.map((unit) => new ClassUnitDto(unit));
  }
}

/** Management view: adds lifecycle state, the meeting URL and audit timestamps. */
export class ClassManagementDto extends ClassDto {
  @ApiProperty({ type: String, enum: ClassStatus })
  readonly status: ClassStatus;

  @ApiProperty({ type: String, format: 'uri', nullable: true })
  readonly meetingUrl: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: Date;

  constructor(view: ClassView) {
    super(view);
    this.status = view.classEntity.status;
    this.meetingUrl = view.classEntity.meetingUrl;
    this.createdAt = view.classEntity.createdAt;
    this.updatedAt = view.classEntity.updatedAt;
  }
}

export class ClassManagementPageDto {
  @ApiProperty({ type: () => ClassManagementDto, isArray: true })
  readonly items: ClassManagementDto[];

  @ApiProperty({ type: Number, example: 1 })
  readonly page: number;

  @ApiProperty({ type: Number, example: 20 })
  readonly pageSize: number;

  @ApiProperty({ type: Number, example: 42 })
  readonly total: number;

  constructor(items: ClassManagementDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}

export class ClassSessionManagementDto extends ClassSessionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly classUnitId: string;

  @ApiProperty({ type: String, format: 'uri', nullable: true })
  readonly meetingUrl: string | null;

  constructor(session: ClassSessionEntity) {
    super(session);
    this.classUnitId = session.classUnitId;
    this.meetingUrl = session.meetingUrl;
  }
}

export class ClassUnitManagementDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  readonly courseUnitId: string;

  @ApiProperty({ type: Number, example: 1 })
  readonly position: number;

  @ApiProperty({ type: String })
  readonly title: string;

  @ApiProperty({ type: String, enum: ClassUnitStatus })
  readonly status: ClassUnitStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly unlockAt: Date | null;

  @ApiProperty({ type: () => ClassSessionManagementDto, isArray: true })
  readonly sessions: ClassSessionManagementDto[];

  constructor(view: ClassUnitView) {
    this.id = view.unit.id;
    this.courseUnitId = view.unit.courseUnitId;
    this.position = view.unit.position;
    this.title = view.title;
    this.status = view.unit.status;
    this.unlockAt = view.unit.unlockAt;
    this.sessions = view.sessions.map((session) => new ClassSessionManagementDto(session));
  }
}

export class ClassManagementDetailDto extends ClassManagementDto {
  @ApiProperty({ type: () => ClassUnitManagementDto, isArray: true })
  readonly units: ClassUnitManagementDto[];

  constructor(view: ClassDetailView) {
    super(view);
    this.units = view.units.map((unit) => new ClassUnitManagementDto(unit));
  }
}
