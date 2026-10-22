import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { effectiveMentorId } from '../domain/effective-mentor.js';
import type { SessionMeetingDto, UpdateSessionMeetingDto } from '../dtos/session-meeting.dto.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';
import {
  SessionAssignmentRequiredException,
  TeachingConflictException,
} from '../exceptions/teaching.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MentorWorkspaceService } from './mentor-workspace.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TeachingReadService } from './teaching-read.service.js';

@Injectable()
export class SessionMeetingService {
  constructor(
    private readonly db: DataSource,
    private readonly workspace: MentorWorkspaceService,
    private readonly read: TeachingReadService,
  ) {}

  async update(
    id: string,
    actor: AuthenticatedUser,
    input: UpdateSessionMeetingDto,
  ): Promise<SessionMeetingDto> {
    return this.db.transaction(async (m) => {
      await this.workspace.actor(m, actor);
      // Serialize with reassignment, rescheduling and session lifecycle changes.
      const { session, classEntity } = await this.read.loadSession(m, id, true);
      if (effectiveMentorId(session, classEntity.mentorId) !== actor.userId)
        throw new SessionAssignmentRequiredException();
      if (
        [ClassStatus.CANCELLED, ClassStatus.COMPLETED].includes(classEntity.status) ||
        ![SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS].includes(session.status)
      )
        throw new TeachingConflictException(
          'SESSION_STATE_CONFLICT',
          'Meeting URL can only change for a scheduled or in-progress session in an active class',
        );
      if (session.version !== input.expectedVersion)
        throw new TeachingConflictException(
          'SESSION_VERSION_CONFLICT',
          'Refetch the session before updating its meeting URL',
        );
      if (session.meetingUrl !== input.meetingUrl) {
        session.meetingUrl = input.meetingUrl;
        session.version += 1;
        await m.getRepository(ClassSessionEntity).save(session);
      }
      return {
        sessionId: session.id,
        classId: classEntity.id,
        meetingUrl: session.meetingUrl,
        effectiveMeetingUrl: session.meetingUrl ?? classEntity.meetingUrl,
        version: session.version,
      };
    });
  }
}
