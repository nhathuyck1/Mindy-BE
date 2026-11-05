import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { EntityManager } from 'typeorm';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
@Injectable()
export class ZipReceiptsService {
  key(key: string | undefined): string {
    if (!key || !isUUID(key, '4')) throw new AssignmentException(422, 'IDEMPOTENCY_KEY_REQUIRED');
    return key.toLowerCase();
  }
  private hash(input: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(canonical(input)))
      .digest('hex');
  }
  async replay<T>(
    m: EntityManager,
    actor: string,
    route: string,
    key: string,
    input: unknown,
  ): Promise<T | null> {
    // Callers lock class/session/assignment before this lock. Includes upload quotas across assignments.
    await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,45))', [actor]);
    const rows: { request_hash: string; outcome: T }[] = await m.query(
      "SELECT payload_hash AS request_hash,outcome FROM mutation_receipts WHERE namespace='assignment_zip' AND actor_id=$1 AND route=$2 AND key=$3",
      [actor, route, key],
    );
    const row = rows[0];
    if (row && row.request_hash !== this.hash(input))
      throw new AssignmentException(409, 'IDEMPOTENCY_KEY_REUSED');
    return row?.outcome ?? null;
  }
  async save(
    m: EntityManager,
    actor: string,
    route: string,
    key: string,
    input: unknown,
    outcome: unknown,
  ): Promise<void> {
    await m.query(
      "INSERT INTO mutation_receipts(namespace,actor_id,route,key,payload_hash,outcome) VALUES('assignment_zip',$1,$2,$3,$4,$5)",
      [actor, route, key, this.hash(input), JSON.stringify(outcome)],
    );
  }
}
