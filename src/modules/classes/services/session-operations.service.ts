import { createHash } from 'node:crypto';
import { HttpStatus, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { isUUID } from 'class-validator';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/postgres-error.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import { toLocalDate } from '../domain/class-calendar.js';
import type {
  CreateMakeupSessionDto,
  MakeupSessionDto,
  RescheduleSessionDto,
  SessionOperationDto,
} from '../dtos/session-operations.dto.js';
import type { TeachingSessionDto } from '../dtos/teaching.dto.js';
import { ClassEntity } from '../entities/class.entity.js';
import { ClassSessionEntity } from '../entities/class-session.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { SessionStatus } from '../enums/session-status.enum.js';
import {
  ClassMentorNotEligibleException,
  ClassUnitNotFoundException,
} from '../exceptions/class.exceptions.js';
import {
  SessionAssignmentRequiredException,
  SessionMakeupDurationMismatchException,
  SessionScheduleNotFutureException,
  TeachingConflictException,
} from '../exceptions/teaching.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassScheduleService } from './class-schedule.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingReadService } from './teaching-read.service.js';

@Injectable()
export class SessionOperationsService {
  constructor(
    private readonly db: DataSource,
    private readonly read: TeachingReadService,
    private readonly users: UsersService,
    private readonly schedule: ClassScheduleService,
  ) {}

  async reschedule(
    id: string,
    input: RescheduleSessionDto,
    actor: AuthenticatedUser,
    key: string | undefined,
  ): Promise<TeachingSessionDto> {
    return this.mutate(id, 'schedule', input, actor, key, async (m, c, s) => {
      this.read.assertClassEditable(c);
      this.assertStatus(s, SessionStatus.SCHEDULED);
      const before = this.schedule.snapshot(s);
      this.assertFuture(input);
      s.startsAt = new Date(input.startsAt);
      s.endsAt = new Date(input.endsAt);
      await this.schedule.saveRescheduled(m, c, s);
      await this.schedule.audit(
        m,
        c,
        s,
        actor.userId,
        input.reason,
        'RESCHEDULE',
        before,
        c.endDate,
      );
      return this.view(m, s);
    });
  }

  async cancel(
    id: string,
    input: SessionOperationDto,
    actor: AuthenticatedUser,
    key: string | undefined,
  ): Promise<TeachingSessionDto> {
    return this.mutate(id, 'cancel', input, actor, key, async (m, c, s) => {
      if (c.status === ClassStatus.COMPLETED) this.read.assertClassEditable(c);
      this.assertStatus(s, SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS);
      await this.schedule.cancelSession(m, c, s, actor.userId, input.reason, 'CANCEL');
      return this.view(m, s);
    });
  }

  async makeup(
    id: string,
    input: CreateMakeupSessionDto,
    actor: AuthenticatedUser,
    key: string | undefined,
  ): Promise<MakeupSessionDto> {
    try {
      return await this.mutate(id, 'makeups', input, actor, key, async (m, c, s) => {
        this.assertStatus(s, SessionStatus.CANCELLED);
        await this.schedule.assertNoPlacements(m, [s.id]);
        if (![ClassStatus.OPEN, ClassStatus.IN_PROGRESS].includes(c.status))
          throw new TeachingConflictException(
            'SESSION_STATE_CONFLICT',
            'Makeup requires an open or in-progress class',
          );
        if (input.classUnitId !== s.classUnitId) throw new ClassUnitNotFoundException();
        if (await m.getRepository(ClassSessionEntity).existsBy({ makeupForSessionId: id }))
          throw new TeachingConflictException(
            'MAKEUP_ALREADY_EXISTS',
            'Use the latest cancelled replacement to continue this chain',
          );
        this.assertFuture(input);
        if (
          new Date(input.endsAt).getTime() - new Date(input.startsAt).getTime() !==
          s.endsAt.getTime() - s.startsAt.getTime()
        )
          throw new SessionMakeupDurationMismatchException();
        const mentorId = input.mentorId ?? c.mentorId;
        if (!(await this.users.findActiveByRole(mentorId, UserRole.MENTOR, m)))
          throw new ClassMentorNotEligibleException(HttpStatus.UNPROCESSABLE_ENTITY);
        const before = this.schedule.snapshot(s);
        const endBefore = c.endDate;
        const endAfter = toLocalDate(
          new Date(new Date(input.endsAt).getTime() - 1),
          this.read.timeZone(),
        );
        if (endAfter > c.endDate) c.endDate = endAfter;
        const repo = m.getRepository(ClassSessionEntity);
        const last = await repo.findOne({
          where: { classUnitId: s.classUnitId },
          order: { sessionNumber: 'DESC' },
        });
        const next = repo.create({
          classUnitId: s.classUnitId,
          sessionNumber: (last?.sessionNumber ?? 0) + 1,
          title: input.title,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          mentorOverrideId: input.mentorId ?? null,
          roomName: s.roomName,
          meetingUrl: s.meetingUrl,
          makeupForSessionId: s.id,
          makeupRootSessionId: s.makeupRootSessionId ?? s.id,
          status: SessionStatus.SCHEDULED,
        });
        this.schedule.assertInterval(next, c);
        await repo.save(next);
        // The final state is visible to the shared same-class and effective mentor validators.
        await this.schedule.assertNoClassOverlap(m, c.id);
        await this.schedule.assertMentorAvailable(m, c);
        await this.schedule.recordConflicts(m, c.id);
        s.version += 1;
        await repo.save(s);
        await this.schedule.audit(
          m,
          c,
          next,
          actor.userId,
          input.reason,
          'MAKEUP',
          before,
          endBefore,
        );
        return {
          originalSessionId: id,
          originalVersion: s.version,
          classEndDate: c.endDate,
          session: await this.view(m, next),
        };
      });
    } catch (error: unknown) {
      if (
        isUniqueViolation(error, 'uq_session_makeup_successor') ||
        isUniqueViolation(error, 'uq_session_makeup_effective_root')
      )
        throw new TeachingConflictException(
          'MAKEUP_ALREADY_EXISTS',
          'This chain already has a replacement',
        );
      throw error;
    }
  }

  private assertFuture(input: RescheduleSessionDto): void {
    if (new Date(input.startsAt) <= new Date()) throw new SessionScheduleNotFutureException();
  }

  private assertStatus(s: ClassSessionEntity, ...states: SessionStatus[]): void {
    if (!states.includes(s.status))
      throw new TeachingConflictException(
        'SESSION_STATE_CONFLICT',
        'Session state does not allow this operation',
      );
  }

  private async view(m: EntityManager, s: ClassSessionEntity): Promise<TeachingSessionDto> {
    const view = (await this.read.sessionViews(m, [s], new Date()))[0];
    if (!view) throw new Error('Saved session missing');
    return view;
  }

  private async mutate<T extends TeachingSessionDto | MakeupSessionDto>(
    id: string,
    action: string,
    input: SessionOperationDto,
    actor: AuthenticatedUser,
    key: string | undefined,
    apply: (m: EntityManager, c: ClassEntity, s: ClassSessionEntity) => Promise<T>,
  ): Promise<T> {
    if (![UserRole.ADMIN, UserRole.MANAGER].includes(actor.role))
      throw new SessionAssignmentRequiredException();
    if (!key || !isUUID(key, '4'))
      throw new UnprocessableEntityException('Idempotency-Key must be a UUID v4');
    const route = `session:${id}:${action}`;
    const hash = createHash('sha256')
      .update(JSON.stringify(input, Object.keys(input).sort()))
      .digest('hex');
    return this.db.transaction(async (m) => {
      const { session: s, classEntity: c } = await this.read.loadSession(m, id, true);
      if (!(await this.users.findActiveByRole(actor.userId, actor.role, m)))
        throw new SessionAssignmentRequiredException();
      const rows: { payload_hash: string; outcome: T }[] = await m.query(
        'SELECT payload_hash,outcome FROM teaching_mutation_receipts WHERE actor_id=$1 AND route=$2 AND key=$3',
        [actor.userId, route, key],
      );
      const receipt = rows[0];
      if (receipt) {
        if (receipt.payload_hash !== hash)
          throw new TeachingConflictException(
            'IDEMPOTENCY_KEY_REUSED',
            'This key was already used for a different request',
          );
        return receipt.outcome;
      }
      if (s.version !== input.expectedVersion)
        throw new TeachingConflictException(
          'SESSION_VERSION_CONFLICT',
          'Refetch the session before changing its schedule',
        );
      const result = await apply(m, c, s);
      c.assignmentVersion += 1;
      await m.getRepository(ClassEntity).save(c);
      await m.query(
        'INSERT INTO teaching_mutation_receipts(actor_id,route,key,payload_hash,outcome) VALUES($1,$2,$3,$4,$5::jsonb)',
        [actor.userId, route, key, hash, JSON.stringify(result)],
      );
      return result;
    });
  }
}
