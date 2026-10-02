import { describe, expect, it } from 'vitest';

import type { ClassDetailView } from '../domain/class-views.js';
import type { ClassEntity } from '../entities/class.entity.js';
import type { ClassSessionEntity } from '../entities/class-session.entity.js';
import type { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { ClassUnitStatus } from '../enums/class-unit-status.enum.js';
import { DeliveryMode } from '../enums/delivery-mode.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';
import { ClassDetailDto, ClassManagementDetailDto } from './class.dto.js';

const MEETING_URL = 'https://meet.example.com/secret-room';

function buildView(occupiedSeats: number): ClassDetailView {
  const now = new Date('2026-10-02T00:00:00Z');
  const classEntity: ClassEntity = {
    id: '11111111-1111-4111-8111-111111111111',
    courseId: '22222222-2222-4222-8222-222222222222',
    mentorId: '33333333-3333-4333-8333-333333333333',
    code: 'WEB101-A',
    name: 'Web 101',
    startDate: '2026-11-02',
    endDate: '2026-11-30',
    maxStudents: 10,
    deliveryMode: DeliveryMode.ONLINE,
    meetingUrl: MEETING_URL,
    status: ClassStatus.OPEN,
    createdAt: now,
    updatedAt: now,
  };
  const unit: ClassUnitEntity = {
    id: '44444444-4444-4444-8444-444444444444',
    classId: classEntity.id,
    courseUnitId: '55555555-5555-4555-8555-555555555555',
    position: 1,
    unlockAt: null,
    status: ClassUnitStatus.LOCKED,
    createdAt: now,
    updatedAt: now,
  };
  const session: ClassSessionEntity = {
    id: '66666666-6666-4666-8666-666666666666',
    classUnitId: unit.id,
    sessionNumber: 1,
    title: 'Kickoff',
    startsAt: new Date('2026-11-02T12:00:00Z'),
    endsAt: new Date('2026-11-02T14:00:00Z'),
    roomName: null,
    meetingUrl: MEETING_URL,
    status: SessionStatus.SCHEDULED,
    createdAt: now,
    updatedAt: now,
  };

  return {
    classEntity,
    mentorName: 'Mentor One',
    occupiedSeats,
    units: [{ unit, title: 'Unit 1', sessions: [session] }],
  };
}

describe('class DTO mapping', () => {
  it('never exposes a meeting URL in the public class detail', () => {
    const dto = new ClassDetailDto(buildView(3));

    expect(JSON.stringify(dto)).not.toContain(MEETING_URL);
    expect(dto.units[0]?.sessions[0]?.title).toBe('Kickoff');
    expect(dto.mentor).toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      displayName: 'Mentor One',
    });
  });

  it('reports available seats and never a negative number', () => {
    expect(new ClassDetailDto(buildView(3)).availableSeats).toBe(7);
    expect(new ClassDetailDto(buildView(12)).availableSeats).toBe(0);
  });

  it('includes meeting URLs and status in the management view', () => {
    const dto = new ClassManagementDetailDto(buildView(0));

    expect(dto.status).toBe(ClassStatus.OPEN);
    expect(dto.meetingUrl).toBe(MEETING_URL);
    expect(dto.units[0]?.sessions[0]?.meetingUrl).toBe(MEETING_URL);
  });
});
