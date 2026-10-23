import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { effectiveMentorId } from '../../classes/domain/effective-mentor.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { SessionStatus } from '../../classes/enums/session-status.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TeachingReadService } from '../../classes/services/teaching-read.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { UsersService } from '../../users/users.service.js';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';

@Injectable()
export class AssignmentAccessService {
  constructor(
    private readonly teaching: TeachingReadService,
    private readonly users: UsersService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async actor(m: EntityManager, actor: AuthenticatedUser, write = false): Promise<void> {
    if (
      ![UserRole.STUDENT, UserRole.MENTOR].includes(actor.role) ||
      !(await this.users.findActiveByRole(actor.userId, actor.role, m, write))
    )
      throw new AssignmentException(403, 'ASSIGNMENT_SCOPE_REQUIRED');
  }

  async session(
    m: EntityManager,
    actor: AuthenticatedUser,
    id: string,
    write = false,
  ): Promise<string | null> {
    await this.actor(m, actor, write);
    const { session, classEntity } = await this.teaching.loadSession(m, id, write);
    if (actor.role === UserRole.MENTOR) {
      if (
        classEntity.mentorId !== actor.userId &&
        effectiveMentorId(session, classEntity.mentorId) !== actor.userId
      )
        throw new AssignmentException(403, 'ASSIGNMENT_SCOPE_REQUIRED');
    }
    if (
      write &&
      ([ClassStatus.CANCELLED, ClassStatus.COMPLETED].includes(classEntity.status) ||
        session.status === SessionStatus.CANCELLED)
    )
      throw new AssignmentException(409, 'ASSIGNMENT_CLOSED');
    if (actor.role !== UserRole.STUDENT) return null;
    const enrollment = await this.enrollments.findActive(actor.userId, classEntity.id, m);
    // Current repository entitlement policy removed legacy unit release/LOCKED gates.
    if (
      !enrollment ||
      classEntity.status === ClassStatus.CANCELLED ||
      session.status === SessionStatus.CANCELLED
    )
      throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
    if (write) {
      const current = await this.enrollments
        .managementQuery(m)
        .where('e.id=:id', { id: enrollment.id })
        .setLock('pessimistic_read')
        .getOne();
      if (current?.status !== 'ACTIVE') throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
    }
    return enrollment.id;
  }
}
