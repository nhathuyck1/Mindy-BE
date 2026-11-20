import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { DeliveryMode } from '../../classes/enums/delivery-mode.enum.js';
import { SessionStatus } from '../../classes/enums/session-status.enum.js';
import { LearningAccessMode } from '../enums/learning-access-mode.enum.js';
import type { SchedulePage } from '../services/my-schedule.service.js';
import { MySchedulePageDto } from './my-schedule.dto.js';

function pageAt(startsAt: string, timeZone = 'Asia/Ho_Chi_Minh'): SchedulePage {
  return {
    items: [
      {
        sessionId: 'session',
        sessionNumber: 1,
        sessionTitle: 'Session 1',
        sessionStatus: SessionStatus.SCHEDULED,
        startsAt: new Date(startsAt),
        endsAt: new Date(new Date(startsAt).getTime() + 2 * 3_600_000),
        roomName: null,
        classId: 'class',
        classCode: 'HTML-CSS-101',
        className: 'HTML & CSS',
        classStatus: ClassStatus.OPEN,
        courseId: 'course',
        courseTitle: 'HTML & CSS',
        classUnitId: 'unit',
        unitTitle: 'Unit 1',
        deliveryMode: DeliveryMode.ONLINE,
        mentorId: 'mentor',
        mentorName: 'Mentor',
        enrollmentId: 'enrollment',
        accessMode: LearningAccessMode.FULL,
        assignmentType: 'PRIMARY',
        attendanceStatus: null,
        attendanceApplicability: 'NOT_STARTED',
        attendanceExcluded: true,
        creditedAttendanceStatus: null,
        makeupForSessionId: null,
        makeupRootSessionId: null,
        sourceClassId: null,
        sourceSessionId: null,
        makeupPlacementId: null,
      },
    ],
    page: 1,
    pageSize: 100,
    total: 1,
    timeZone,
    from: new Date('2026-10-11T17:00:00Z'),
    to: new Date('2026-10-18T17:00:00Z'),
    asOf: new Date('2026-10-12T00:00:00Z'),
  };
}

describe('MySchedulePageDto calendar fields', () => {
  it.each([
    ['2026-10-11T17:30:00Z', 'Monday'],
    ['2026-10-12T17:30:00Z', 'Tuesday'],
    ['2026-10-13T17:30:00Z', 'Wednesday'],
    ['2026-10-14T17:30:00Z', 'Thursday'],
    ['2026-10-15T17:30:00Z', 'Friday'],
    ['2026-10-16T17:30:00Z', 'Saturday'],
    ['2026-10-17T17:30:00Z', 'Sunday'],
  ])('uses the local start weekday for %s', (startsAt, dayOfWeek) => {
    const result = new MySchedulePageDto(pageAt(startsAt));
    expect(result.items[0]).toMatchObject({
      dayOfWeek,
      startTime: '00:30',
      endTime: '02:30',
      startsAt: new Date(startsAt),
    });
  });

  it('uses the response time zone rather than UTC or the host time zone', () => {
    const startsAt = '2026-10-12T00:30:00Z';
    expect(new MySchedulePageDto(pageAt(startsAt)).items[0]).toMatchObject({
      dayOfWeek: 'Monday',
      startTime: '07:30',
      endTime: '09:30',
    });
    expect(new MySchedulePageDto(pageAt(startsAt, 'America/New_York')).items[0]).toMatchObject({
      dayOfWeek: 'Sunday',
      startTime: '20:30',
      endTime: '22:30',
    });
  });

  it('keeps the start weekday when an overnight session ends on the following day', () => {
    const result = new MySchedulePageDto(pageAt('2026-10-13T16:30:00Z'));
    expect(result.items[0]).toMatchObject({
      dayOfWeek: 'Tuesday',
      startTime: '23:30',
      endTime: '01:30',
      endsAt: new Date('2026-10-13T18:30:00Z'),
    });
  });
});
