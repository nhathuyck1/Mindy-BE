import { createHash } from 'node:crypto';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { isUUID } from 'class-validator';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { effectiveMentorId } from '../../classes/domain/effective-mentor.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { SessionStatus } from '../../classes/enums/session-status.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TeachingReadService } from '../../classes/services/teaching-read.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { UsersService } from '../../users/users.service.js';
import type {
  CorrectTeachingNoteInput,
  TeachingNoteDto,
  TeachingNoteInput,
  TeachingNoteResponseDto,
} from '../dtos/teaching-note.dto.js';
import { TeachingNoteConflictException } from '../exceptions/teaching-note.exceptions.js';

@Injectable()
export class TeachingNotesService {
  constructor(
    private readonly db: DataSource,
    private readonly teaching: TeachingReadService,
    private readonly users: UsersService,
  ) {}

  async get(id: string, actor: AuthenticatedUser, staff = false): Promise<TeachingNoteResponseDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await m.query('SET TRANSACTION READ ONLY');
      await this.authorize(m, id, actor, staff, false);
      return this.read(m, id);
    });
  }

  async put(
    id: string,
    actor: AuthenticatedUser,
    input: TeachingNoteInput | CorrectTeachingNoteInput,
    key: string | undefined,
    staff = false,
  ): Promise<TeachingNoteResponseDto> {
    if (!key || !isUUID(key, '4'))
      throw new UnprocessableEntityException('Idempotency-Key must be a UUID v4');
    const reason = 'reason' in input ? input.reason : null;
    if (staff && !reason?.trim())
      throw new UnprocessableEntityException('Staff correction reason is required');
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          id,
          staff,
          expectedVersion: input.expectedVersion,
          content: input.content,
          nextSteps: input.nextSteps,
          reason,
        }),
      )
      .digest('hex');
    return this.db.transaction(async (m) => {
      const { session, classEntity } = await this.authorize(m, id, actor, staff, true);
      // Same actor/key may be used concurrently against different sessions: serialize before receipt lookup.
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `teaching-note:${actor.userId}:${key.toLowerCase()}`,
      ]);
      const current = await this.read(m, id, true);
      if (
        classEntity.status === ClassStatus.CANCELLED ||
        (!staff &&
          ![SessionStatus.IN_PROGRESS, SessionStatus.COMPLETED].includes(session.status)) ||
        (staff &&
          (!session.actualStartedAt ||
            session.status === SessionStatus.SCHEDULED ||
            (session.status === SessionStatus.CANCELLED &&
              (!current.note || !session.actualStartedAt))))
      )
        throw new TeachingNoteConflictException('TEACHING_NOTE_STATE_CONFLICT');
      if (!staff && (!session.editableUntil || new Date() >= session.editableUntil))
        throw new TeachingNoteConflictException('TEACHING_NOTE_WINDOW_CLOSED');
      const receipts: { request_hash: string; response: TeachingNoteResponseDto }[] = await m.query(
        'SELECT request_hash,response FROM teaching_note_receipts WHERE actor_id=$1 AND idempotency_key=$2',
        [actor.userId, key],
      );
      const receipt = receipts[0];
      if (receipt) {
        if (receipt.request_hash !== hash)
          throw new TeachingNoteConflictException('IDEMPOTENCY_KEY_REUSED');
        return receipt.response;
      }
      if (input.expectedVersion !== current.version)
        throw new TeachingNoteConflictException('TEACHING_VERSION_CONFLICT');
      await m.query(
        `INSERT INTO teaching_notes(session_id,content,next_steps,version,created_by,updated_by)
        VALUES($1,$2,$3,1,$4,$4) ON CONFLICT(session_id) DO UPDATE SET content=$2,next_steps=$3,
        version=teaching_notes.version+1,updated_by=$4,updated_at=clock_timestamp()`,
        [id, input.content, input.nextSteps, actor.userId],
      );
      const result = await this.read(m, id);
      await m.query(
        'INSERT INTO teaching_note_audits(session_id,actor_id,version,reason,snapshot) VALUES($1,$2,$3,$4,$5)',
        [id, actor.userId, result.version, reason, JSON.stringify(result)],
      );
      await m.query(
        'INSERT INTO teaching_note_receipts(actor_id,idempotency_key,request_hash,response) VALUES($1,$2,$3,$4)',
        [actor.userId, key, hash, JSON.stringify(result)],
      );
      return result;
    });
  }

  private async authorize(
    m: EntityManager,
    id: string,
    actor: AuthenticatedUser,
    staff: boolean,
    write: boolean,
  ) {
    if (
      !(staff
        ? [UserRole.ADMIN, UserRole.MANAGER].includes(actor.role)
        : actor.role === UserRole.MENTOR) ||
      !(await this.users.findActiveByRole(actor.userId, actor.role, m, write))
    )
      this.deny();
    const ctx = await this.teaching.loadSession(m, id, write);
    const effective = effectiveMentorId(ctx.session, ctx.classEntity.mentorId) === actor.userId;
    if (!staff && !(write ? effective : effective || ctx.classEntity.mentorId === actor.userId))
      this.deny();
    return ctx;
  }

  private async read(m: EntityManager, id: string, lock = false): Promise<TeachingNoteResponseDto> {
    const rows: (Omit<TeachingNoteDto, 'createdAt' | 'updatedAt'> & {
      createdAt: Date;
      updatedAt: Date;
    })[] = await m.query(
      `SELECT content,next_steps AS "nextSteps",version,created_by AS "createdBy",updated_by AS "updatedBy",created_at AS "createdAt",updated_at AS "updatedAt" FROM teaching_notes WHERE session_id=$1 ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    );
    const row = rows[0];
    return {
      sessionId: id,
      version: row?.version ?? 0,
      note: row
        ? { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
        : null,
    };
  }
  private deny(): never {
    throw new AppHttpException(
      403,
      'MENTOR_SCOPE_REQUIRED',
      'Current teaching or staff assignment is required',
    );
  }
}
