import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { EFFECTIVE_MENTOR_SQL, OCCUPIED_SESSION_SQL } from '../domain/effective-mentor.js';
import { ClassMentorScheduleConflictException } from '../exceptions/class.exceptions.js';

export interface TeachingInterval {
  readonly sessionId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly mentorId: string;
}

/** Shared by discovery and every timetable writer; no network calls or other module internals. */
@Injectable()
export class MentorConflictService {
  async lockMentors(manager: EntityManager, ids: readonly string[]): Promise<void> {
    for (const id of [...new Set(ids)].sort()) {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id]);
    }
  }

  async hasConflict(manager: EntityManager, interval: TeachingInterval): Promise<boolean> {
    if (interval.startsAt >= interval.endsAt) return false;
    const rows: unknown[] = await manager.query(
      `SELECT 1 FROM class_sessions s
      JOIN class_units u ON u.id = s.class_unit_id JOIN classes c ON c.id = u.class_id
      WHERE s.id <> $1 AND ${OCCUPIED_SESSION_SQL} AND ${EFFECTIVE_MENTOR_SQL} = $2
        AND s.starts_at < $4 AND s.ends_at > $3 LIMIT 1`,
      [interval.sessionId, interval.mentorId, interval.startsAt, interval.endsAt],
    );
    return rows.length > 0;
  }

  async assertAvailable(
    manager: EntityManager,
    intervals: readonly TeachingInterval[],
  ): Promise<void> {
    await this.lockMentors(
      manager,
      intervals.map((i) => i.mentorId),
    );
    for (const interval of intervals) {
      if (await this.hasConflict(manager, interval))
        throw new ClassMentorScheduleConflictException();
    }
  }
}
