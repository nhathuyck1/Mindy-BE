import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource } from 'typeorm';

export interface ChatJob {
  readonly id: string;
  readonly event_id: string;
  readonly conversation_id: string | null;
  readonly recipient_ids: string[];
  readonly checkpoint: number;
  readonly lease_token: string;
  readonly attempts: number;
}

/** Claims and completions are fenced; no network I/O takes place in a claim transaction. */
@Injectable()
export class ChatJobsService {
  constructor(private readonly db: DataSource) {}
  async claim(consumer: string): Promise<ChatJob | null> {
    const token = randomUUID();
    const rows: ChatJob[] = await this.db.query(
      `WITH candidate AS (
      SELECT id FROM chat_jobs WHERE consumer=$1 AND attempts<8 AND
        ((status='PENDING' AND next_attempt_at<=clock_timestamp()) OR
         (status='RUNNING' AND lease_until<=clock_timestamp()))
      ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1), claimed AS (
      UPDATE chat_jobs j SET status='RUNNING',attempts=j.attempts+1,lease_token=$2,
        lease_until=clock_timestamp()+interval '30 seconds'
      FROM candidate c WHERE j.id=c.id RETURNING j.*) SELECT * FROM claimed`,
      [consumer, token],
    );
    // A final crashed lease must also become inspectable as a dead letter.
    await this.db.query(
      `UPDATE chat_jobs SET status='DEAD',lease_token=NULL,lease_until=NULL,
      last_error_code='LEASE_EXHAUSTED' WHERE consumer=$1 AND status='RUNNING' AND
      attempts>=8 AND lease_until<=clock_timestamp()`,
      [consumer],
    );
    return rows[0] ?? null;
  }
  async complete(job: ChatJob): Promise<boolean> {
    const rows: { id: string }[] = await this.db.query(
      `WITH changed AS (UPDATE chat_jobs SET status='DONE',
      completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL
      WHERE id=$1 AND status='RUNNING' AND lease_token=$2 AND lease_until>clock_timestamp()
      RETURNING id) SELECT * FROM changed`,
      [job.id, job.lease_token],
    );
    return rows.length === 1;
  }
  async checkpoint(job: ChatJob, position: number): Promise<boolean> {
    const rows: { id: string }[] = await this.db.query(
      `WITH changed AS (UPDATE chat_jobs SET checkpoint=GREATEST(checkpoint,$3),
      lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1 AND status='RUNNING'
      AND lease_token=$2 AND lease_until>clock_timestamp() RETURNING id) SELECT * FROM changed`,
      [job.id, job.lease_token, position],
    );
    return rows.length === 1;
  }
  async fail(job: ChatJob): Promise<void> {
    await this.db.query(
      `UPDATE chat_jobs SET status=CASE WHEN attempts>=8 THEN 'DEAD' ELSE 'PENDING' END,
      next_attempt_at=clock_timestamp()+make_interval(secs=>LEAST(300,power(2,attempts)::int)),
      lease_token=NULL,lease_until=NULL,last_error_code='CHAT_JOB_FAILED'
      WHERE id=$1 AND status='RUNNING' AND lease_token=$2 AND lease_until>clock_timestamp()`,
      [job.id, job.lease_token],
    );
  }
}
