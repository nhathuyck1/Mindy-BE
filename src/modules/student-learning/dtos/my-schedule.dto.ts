import { ApiProperty } from '@nestjs/swagger';

import { ClassMentorDto } from '../../classes/dtos/class.dto.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { DeliveryMode } from '../../classes/enums/delivery-mode.enum.js';
import { SessionStatus } from '../../classes/enums/session-status.enum.js';
import { LearningAccessMode } from '../enums/learning-access-mode.enum.js';
import type { ScheduleEvent, SchedulePage } from '../services/my-schedule.service.js';

/**
 * One session of an enrolled class. Never carries meeting URLs, materials, classmates or
 * payment data; open the class detail to join.
 */
export class ScheduleEventDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly sessionId: string;
  @ApiProperty({ type: Number, example: 1 })
  readonly sessionNumber: number;
  @ApiProperty({ type: String })
  readonly sessionTitle: string;
  @ApiProperty({ type: String, enum: SessionStatus })
  readonly sessionStatus: SessionStatus;
  @ApiProperty({ type: String, format: 'date-time' })
  readonly startsAt: Date;
  @ApiProperty({ type: String, format: 'date-time' })
  readonly endsAt: Date;
  @ApiProperty({
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    example: 'Tuesday',
    description: 'Weekday of startsAt in the response timeZone, including overnight sessions',
  })
  readonly dayOfWeek: string;
  @ApiProperty({
    type: String,
    example: '07:30',
    pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
    description: 'Local startsAt clock time (HH:mm, 24-hour) in the response timeZone',
  })
  readonly startTime: string;
  @ApiProperty({
    type: String,
    example: '09:30',
    pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
    description: 'Local endsAt clock time (HH:mm, 24-hour); may be on the next day',
  })
  readonly endTime: string;
  @ApiProperty({ type: String, nullable: true })
  readonly roomName: string | null;
  @ApiProperty({ type: String, format: 'uuid' })
  readonly classId: string;
  @ApiProperty({ type: String })
  readonly classCode: string;
  @ApiProperty({ type: String })
  readonly className: string;
  @ApiProperty({ type: String, enum: ClassStatus })
  readonly classStatus: ClassStatus;
  @ApiProperty({ type: String, format: 'uuid' })
  readonly courseId: string;
  @ApiProperty({ type: String })
  readonly courseTitle: string;
  @ApiProperty({ type: String, format: 'uuid' })
  readonly classUnitId: string;
  @ApiProperty({ type: String })
  readonly unitTitle: string;
  @ApiProperty({ type: String, enum: DeliveryMode })
  readonly deliveryMode: DeliveryMode;
  @ApiProperty({ type: () => ClassMentorDto })
  readonly mentor: ClassMentorDto;
  @ApiProperty({ type: String, format: 'uuid' })
  readonly enrollmentId: string;
  @ApiProperty({
    type: String,
    enum: [LearningAccessMode.FULL, LearningAccessMode.CASH_PREVIEW],
    description: 'Which class endpoint to open: detail (FULL) or preview (CASH_PREVIEW)',
  })
  readonly accessMode: LearningAccessMode;

  constructor(event: ScheduleEvent, timeZone: string) {
    this.sessionId = event.sessionId;
    this.sessionNumber = event.sessionNumber;
    this.sessionTitle = event.sessionTitle;
    this.sessionStatus = event.sessionStatus;
    this.startsAt = event.startsAt;
    this.endsAt = event.endsAt;
    this.dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(
      event.startsAt,
    );
    const clock = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    this.startTime = clock.format(event.startsAt);
    this.endTime = clock.format(event.endsAt);
    this.roomName = event.roomName;
    this.classId = event.classId;
    this.classCode = event.classCode;
    this.className = event.className;
    this.classStatus = event.classStatus;
    this.courseId = event.courseId;
    this.courseTitle = event.courseTitle;
    this.classUnitId = event.classUnitId;
    this.unitTitle = event.unitTitle;
    this.deliveryMode = event.deliveryMode;
    this.mentor = new ClassMentorDto(event.mentorId, event.mentorName);
    this.enrollmentId = event.enrollmentId;
    this.accessMode = event.accessMode;
  }
}

export class MySchedulePageDto {
  @ApiProperty({ type: () => ScheduleEventDto, isArray: true })
  readonly items: ScheduleEventDto[];
  @ApiProperty({ type: Number, example: 1 })
  readonly page: number;
  @ApiProperty({ type: Number, example: 100 })
  readonly pageSize: number;
  @ApiProperty({ type: Number, example: 6 })
  readonly total: number;
  @ApiProperty({ type: String, example: 'Asia/Ho_Chi_Minh', description: 'Center time zone' })
  readonly timeZone: string;
  @ApiProperty({ type: String, format: 'date-time' })
  readonly from: Date;
  @ApiProperty({ type: String, format: 'date-time' })
  readonly to: Date;
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Server time used for every deadline in this response',
  })
  readonly asOf: Date;

  constructor(result: SchedulePage) {
    this.items = result.items.map((event) => new ScheduleEventDto(event, result.timeZone));
    this.page = result.page;
    this.pageSize = result.pageSize;
    this.total = result.total;
    this.timeZone = result.timeZone;
    this.from = result.from;
    this.to = result.to;
    this.asOf = result.asOf;
  }
}
