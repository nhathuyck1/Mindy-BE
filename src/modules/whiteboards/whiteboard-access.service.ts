import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AuthService } from '../auth/auth.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { effectiveMentorId } from '../classes/domain/effective-mentor.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TeachingReadService } from '../classes/services/teaching-read.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { EnrollmentsService } from '../enrollments/services/enrollments.service.js';
import { UserRole } from '../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { UsersService } from '../users/users.service.js';
import { boardError } from './domain/board-document.js';

@Injectable()
export class WhiteboardAccessService {
  constructor(
    private readonly teaching: TeachingReadService,
    private readonly users: UsersService,
    private readonly enrollments: EnrollmentsService,
    private readonly auth: AuthService,
  ) {}
  async session(
    m: EntityManager,
    actor: AuthenticatedUser,
    sessionId: string,
    lock: boolean | 'read' = false,
  ) {
    if (![UserRole.MENTOR, UserRole.STUDENT].includes(actor.role))
      boardError(403, 'BOARD_ACCESS_DENIED');
    const { session, classEntity } = await this.teaching.loadSession(m, sessionId, lock);
    await this.auth.assertAccessPrincipalValid(actor, m);
    const user = await this.users.findActiveByRole(actor.userId, actor.role, m, !!lock);
    if (
      !user ||
      session.status === 'CANCELLED' ||
      ['CANCELLED', 'DRAFT'].includes(classEntity.status)
    )
      boardError(403, 'BOARD_ACCESS_DENIED');
    const mentor = actor.role === UserRole.MENTOR;
    if (mentor) {
      if (
        classEntity.mentorId !== actor.userId &&
        effectiveMentorId(session, classEntity.mentorId) !== actor.userId
      )
        boardError(403, 'BOARD_ACCESS_DENIED');
    } else if (
      !(await this.enrollments.findActive(actor.userId, classEntity.id, m, !!lock)) &&
      !(await this.teaching.whiteboardGuestAccess(m, sessionId, actor.userId))
    ) {
      boardError(403, 'BOARD_FULL_ACCESS_REQUIRED');
    }
    return {
      sessionId,
      sessionTitle: session.title,
      classId: classEntity.id,
      className: classEntity.name,
      sessionStatus: session.status,
      displayName: user.displayName,
      mentor,
    };
  }
  capabilities(scope: Awaited<ReturnType<WhiteboardAccessService['session']>>, mode?: string) {
    return {
      canView: true,
      canCreate: scope.mentor,
      canEdit: scope.mentor || (scope.sessionStatus === 'IN_PROGRESS' && mode === 'COLLABORATIVE'),
      canControl: scope.mentor,
      canUpload: scope.mentor,
      canSnapshot: scope.mentor,
      canRestore: scope.mentor,
      canExport: scope.mentor,
    };
  }
}
