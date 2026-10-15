import { createHash } from 'node:crypto';
import { HttpStatus, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { isUUID } from 'class-validator';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import { effectiveMentorId } from '../domain/effective-mentor.js';
import type { ClassMentorAssignmentDto, TeachingSessionDto } from '../dtos/teaching.dto.js';
import type { AssignClassMentorDto, AssignSessionMentorDto } from '../dtos/teaching-query.dto.js';
import { ClassEntity } from '../entities/class.entity.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';
import { ClassMentorNotEligibleException } from '../exceptions/class.exceptions.js';
import {
  SessionAssignmentRequiredException,
  TeachingConflictException,
} from '../exceptions/teaching.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { MentorConflictService } from './mentor-conflict.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingReadService } from './teaching-read.service.js';

@Injectable()
export class TeachingAssignmentService {
  constructor(
    private readonly db: DataSource,
    private readonly users: UsersService,
    private readonly read: TeachingReadService,
    private readonly conflicts: MentorConflictService,
  ) {}

  async assignSession(
    id: string,
    input: AssignSessionMentorDto,
    actor: AuthenticatedUser,
    key: string | undefined,
  ): Promise<TeachingSessionDto> {
    this.validate(actor, key);
    return this.db.transaction(async (m) => {
      const { session: s, classEntity: c } = await this.read.loadSession(m, id, true);
      await this.assertActor(m, actor);
      const route = `session:${id}:mentor`;
      const hash = this.hash(input);
      const replay = await this.replay<TeachingSessionDto>(m, actor.userId, route, key, hash);
      if (replay) return replay;
      this.read.assertAssignmentEditable(c, s);
      if (s.version !== input.expectedVersion)
        throw new TeachingConflictException(
          'SESSION_VERSION_CONFLICT',
          'Refetch the session before assigning a mentor',
        );
      const old = effectiveMentorId(s, c.mentorId);
      const next = input.mentorId ?? c.mentorId;
      await this.conflicts.lockMentors(m, [next, ...(old ? [old] : [])]);
      await this.assertMentor(m, next);
      const now = new Date();
      const [startsAt, endsAt] = this.read.checkedInterval(s, now);
      if (c.status !== ClassStatus.DRAFT || s.status !== SessionStatus.SCHEDULED) {
        await this.conflicts.assertAvailable(m, [
          { sessionId: id, mentorId: next, startsAt, endsAt },
        ]);
      }
      s.mentorOverrideId = input.mentorId;
      if (s.status !== SessionStatus.SCHEDULED) s.teachingMentorId = next;
      s.version += 1;
      await m.getRepository(ClassSessionEntity).save(s);
      await this.audit(m, c.id, s.id, actor.userId, old, next, input.reason, s.version);
      const result = (await this.read.sessionViews(m, [s], now))[0];
      if (!result) throw new Error('Saved session missing');
      await this.remember(m, actor.userId, route, key, hash, result);
      return result;
    });
  }

  async assignClass(
    id: string,
    input: AssignClassMentorDto,
    actor: AuthenticatedUser,
    key: string | undefined,
  ): Promise<ClassMentorAssignmentDto> {
    this.validate(actor, key);
    return this.db.transaction(async (m) => {
      const c = await this.read.loadClass(m, id, true);
      await this.assertActor(m, actor);
      const route = `class:${id}:mentor`;
      const hash = this.hash(input);
      const replay = await this.replay<ClassMentorAssignmentDto>(m, actor.userId, route, key, hash);
      if (replay) return replay;
      this.read.assertClassEditable(c);
      if (c.assignmentVersion !== input.expectedVersion)
        throw new TeachingConflictException(
          'CLASS_ASSIGNMENT_VERSION_CONFLICT',
          'Refetch the class before assigning a mentor',
        );
      const sessions = await this.read.affectedSessions(m, id);
      await this.conflicts.lockMentors(m, [c.mentorId, input.mentorId]);
      await this.assertMentor(m, input.mentorId);
      const old = c.mentorId;
      c.mentorId = input.mentorId;
      c.assignmentVersion += 1;
      await m.getRepository(ClassEntity).save(c);
      // Save the final state before checking: the shared checker also sees conflicts within this class.
      for (const s of sessions) s.version += 1;
      await m.getRepository(ClassSessionEntity).save(sessions);
      if (c.status !== ClassStatus.DRAFT)
        await this.conflicts.assertAvailable(
          m,
          sessions.map((s) => ({
            sessionId: s.id,
            mentorId: input.mentorId,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
          })),
        );
      await this.audit(
        m,
        c.id,
        null,
        actor.userId,
        old,
        c.mentorId,
        input.reason,
        c.assignmentVersion,
      );
      const mentor = await this.users.findActiveByRole(c.mentorId, UserRole.MENTOR, m);
      const result: ClassMentorAssignmentDto = {
        classId: id,
        primaryMentor: { id: c.mentorId, displayName: mentor?.displayName ?? null },
        assignmentVersion: c.assignmentVersion,
        affectedSessionCount: sessions.length,
        asOf: new Date(),
      };
      await this.remember(m, actor.userId, route, key, hash, result);
      return result;
    });
  }

  private validate(actor: AuthenticatedUser, key: string | undefined): void {
    if (![UserRole.ADMIN, UserRole.MANAGER].includes(actor.role))
      throw new SessionAssignmentRequiredException();
    if (!key || !isUUID(key, '4'))
      throw new UnprocessableEntityException('Idempotency-Key must be a UUID v4');
  }

  private async assertActor(m: EntityManager, actor: AuthenticatedUser): Promise<void> {
    if (!(await this.users.findActiveByRole(actor.userId, actor.role, m)))
      throw new SessionAssignmentRequiredException();
  }

  private async assertMentor(m: EntityManager, id: string): Promise<void> {
    if (!(await this.users.findActiveByRole(id, UserRole.MENTOR, m)))
      throw new ClassMentorNotEligibleException(HttpStatus.UNPROCESSABLE_ENTITY);
  }

  private hash(input: AssignClassMentorDto | AssignSessionMentorDto): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          mentorId: input.mentorId,
          reason: input.reason,
          expectedVersion: input.expectedVersion,
        }),
      )
      .digest('hex');
  }

  private async replay<T>(
    m: EntityManager,
    actor: string,
    route: string,
    key: string | undefined,
    hash: string,
  ): Promise<T | null> {
    const rows: { payload_hash: string; outcome: T }[] = await m.query(
      'SELECT payload_hash, outcome FROM teaching_mutation_receipts WHERE actor_id=$1 AND route=$2 AND key=$3',
      [actor, route, key],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.payload_hash !== hash)
      throw new TeachingConflictException(
        'IDEMPOTENCY_KEY_REUSED',
        'This key was already used for a different request',
      );
    return row.outcome;
  }

  private async remember(
    m: EntityManager,
    actor: string,
    route: string,
    key: string | undefined,
    hash: string,
    outcome: TeachingSessionDto | ClassMentorAssignmentDto,
  ): Promise<void> {
    await m.query(
      'INSERT INTO teaching_mutation_receipts(actor_id,route,key,payload_hash,outcome) VALUES($1,$2,$3,$4,$5::jsonb)',
      [actor, route, key, hash, JSON.stringify(outcome)],
    );
  }

  private async audit(
    m: EntityManager,
    classId: string,
    sessionId: string | null,
    actor: string,
    old: string | null,
    next: string,
    reason: string,
    version: number,
  ): Promise<void> {
    await m.query(
      `INSERT INTO teaching_assignment_audits(class_id,session_id,actor_id,old_mentor_id,new_mentor_id,reason,version)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [classId, sessionId, actor, old, next, reason, version],
    );
  }
}
