import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource } from 'typeorm';
// biome-ignore lint/style/useImportType: Nest DI token.
import { AuthService } from '../auth/auth.service.js';
import { AuthenticationRequiredException } from '../auth/exceptions/auth.exceptions.js';
import type { UserRole } from '../users/user-role.enum.js';
import {
  PUSH_PROVIDER,
  type PushProvider,
  PushProviderError,
  providerFailure,
} from './fcm.adapter.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { PushConfig } from './push-config.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { PushCrypto } from './push-crypto.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { PushEligibility } from './push-eligibility.service.js';
import type { InstallationRow } from './push-registry.service.js';

export interface PushJob {
  id: string;
  notification_id: string;
  installation_id: string;
  installation_generation: string;
  attempts: number;
  expires_at: Date;
  lease_token: string;
}
interface SendRow extends InstallationRow {
  notification_owner: string;
  conversation_id: string;
  role: UserRole;
}
export function retryDelay(
  attempt: number,
  quota: boolean,
  retryAfterMs: number,
  random = Math.random(),
): number {
  return Math.max(
    quota ? 60000 : 0,
    retryAfterMs,
    Math.min(60000, 1000 * 2 ** (attempt - 1)) * (1 + random),
  );
}
@Injectable()
export class PushWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PushWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;
  constructor(
    private readonly db: DataSource,
    private readonly config: PushConfig,
    private readonly crypto: PushCrypto,
    private readonly eligibility: PushEligibility,
    private readonly auth: AuthService,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
  ) {}
  onApplicationBootstrap(): void {
    if (!this.config.enabled || !this.config.workerEnabled) return;
    this.timer = setInterval(() => {
      if (this.running || this.stopped) return;
      this.running = this.tick()
        .catch(() => {
          this.logger.error('PUSH_WORKER_FAILED');
        })
        .finally(() => {
          this.running = undefined;
        });
    }, 500);
    this.timer.unref();
  }
  async claim(): Promise<PushJob | undefined> {
    const rows: PushJob[] = await this.db.query(`WITH candidate AS (
      SELECT id FROM notification_push_deliveries WHERE (status='PENDING' AND next_attempt_at<=clock_timestamp())
      OR (status='RUNNING' AND lease_until<=clock_timestamp()) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
      , claimed AS (UPDATE notification_push_deliveries d SET status='RUNNING',attempts=attempts+1,lease_token=gen_random_uuid(),
      lease_until=clock_timestamp()+interval '30 seconds' FROM candidate c WHERE d.id=c.id RETURNING d.*) SELECT * FROM claimed`);
    return rows[0];
  }
  async tick(): Promise<void> {
    if (this.stopped || !this.config.enabled || !this.config.workerEnabled) return;
    const job = await this.claim();
    if (job) await this.deliver(job);
  }
  async deliver(job: PushJob): Promise<void> {
    if (this.stopped || !this.config.enabled || !this.config.workerEnabled) return;
    if (job.attempts > 8) {
      await this.finish(job, 'DEAD', 'MAX_ATTEMPTS');
      return;
    }
    // Heartbeat fences a slow SDK request. No source locks/transaction survive the network call.
    let fenced = false;
    const heartbeat = setInterval(() => {
      void this.db
        .query(
          `WITH renewed AS (UPDATE notification_push_deliveries
      SET lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1 AND status='RUNNING' AND lease_token=$2
      AND lease_until>clock_timestamp() RETURNING id) SELECT id FROM renewed`,
          [job.id, job.lease_token],
        )
        .then((rows: { id: string }[]) => {
          if (!rows.length) fenced = true;
        })
        .catch(() => {
          fenced = true;
        });
    }, 5000);
    heartbeat.unref();
    const started = Date.now();
    let providerStarted = false;
    try {
      const rows: SendRow[] = await this.db.query(
        `SELECT i.*,n.user_id AS notification_owner,n.conversation_id,u.role
        FROM notification_push_deliveries d JOIN push_installations i ON i.id=d.installation_id
        JOIN notifications n ON n.id=d.notification_id JOIN chat_messages x ON x.id=n.message_id
        JOIN chat_members member ON member.conversation_id=n.conversation_id AND member.user_id=n.user_id
        JOIN users u ON u.id=i.user_id
        WHERE d.id=$1 AND d.status='RUNNING' AND d.lease_token=$2 AND d.lease_until>clock_timestamp()
        AND d.expires_at>clock_timestamp() AND i.status='ACTIVE' AND i.generation=d.installation_generation
        AND i.user_id=n.user_id AND i.last_seen_at>clock_timestamp()-interval '30 days'
        AND n.read_at IS NULL AND n.created_at>=clock_timestamp()-interval '90 days' AND x.deleted_at IS NULL
        AND member.left_at IS NULL AND x.sequence>=member.visible_from_seq AND x.sequence>member.last_read_seq
        AND x.created_at>=$3::timestamptz`,
        [job.id, job.lease_token, this.config.cutoff],
      );
      const row = rows[0];
      if (!row) {
        await this.finish(job, 'SKIPPED', 'INELIGIBLE');
        return;
      }
      const actor = { userId: row.user_id, sessionId: row.session_id, role: row.role };
      try {
        await this.auth.assertAccessPrincipalValid(actor);
      } catch (error) {
        if (!(error instanceof AuthenticationRequiredException)) throw error;
        await this.finish(job, 'SKIPPED', 'SESSION_REVOKED');
        return;
      }
      if (!(await this.eligibility.allowed(this.db.manager, actor, row.conversation_id))) {
        await this.finish(job, 'SKIPPED', 'SCOPE_REVOKED');
        return;
      }
      if (fenced || this.stopped || !this.config.enabled || !this.config.workerEnabled) return;
      // Recheck mutable delivery/binding/read state after the potentially slow source-policy query.
      const current: { id: string }[] = await this.db.query(
        `SELECT d.id FROM notification_push_deliveries d
        JOIN push_installations i ON i.id=d.installation_id JOIN notifications n ON n.id=d.notification_id
        JOIN chat_messages x ON x.id=n.message_id JOIN auth_sessions s ON s.id=i.session_id
        JOIN chat_members member ON member.conversation_id=n.conversation_id AND member.user_id=n.user_id
        JOIN users u ON u.id=i.user_id WHERE d.id=$1 AND d.status='RUNNING' AND d.lease_token=$2
        AND d.lease_until>clock_timestamp() AND d.expires_at>clock_timestamp() AND i.status='ACTIVE'
        AND i.generation=$3 AND i.session_id=$4 AND i.user_id=n.user_id AND n.read_at IS NULL AND x.deleted_at IS NULL
        AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND u.status='ACTIVE' AND u.role=$5
        AND member.left_at IS NULL AND x.sequence>=member.visible_from_seq AND x.sequence>member.last_read_seq`,
        [job.id, job.lease_token, job.installation_generation, row.session_id, row.role],
      );
      if (!current.length) {
        await this.finish(job, 'SKIPPED', 'INELIGIBLE');
        return;
      }
      let token: string;
      try {
        token = this.crypto.decrypt(row.id, row);
      } catch {
        throw new PushProviderError('CONFIGURATION');
      }
      providerStarted = true;
      const id = await this.provider.send({
        token,
        notificationId: job.notification_id,
        ttlSeconds: Math.max(0, Math.floor((job.expires_at.getTime() - Date.now()) / 1000)),
      });
      providerStarted = false;
      await this.finish(job, 'SENT', null, id);
      this.logger.log(
        JSON.stringify({
          event: 'PUSH_ACCEPTED',
          deliveryId: job.id,
          attempt: job.attempts,
          latencyMs: Date.now() - started,
        }),
      );
    } catch (e) {
      // DB/policy failures leave the lease recoverable; they are not provider rejections.
      if (!providerStarted && !(e instanceof PushProviderError)) throw e;
      const failure = providerFailure(e);
      if (failure.reason === 'UNREGISTERED') {
        await this.db.query(
          `UPDATE push_installations i SET status='INVALID',revoked_at=clock_timestamp(),updated_at=clock_timestamp()
          WHERE i.id=$1 AND i.generation=$2 AND EXISTS(SELECT 1 FROM notification_push_deliveries d
          WHERE d.id=$3 AND d.status='RUNNING' AND d.lease_token=$4 AND d.lease_until>clock_timestamp())`,
          [job.installation_id, job.installation_generation, job.id, job.lease_token],
        );
        await this.finish(job, 'SKIPPED', 'UNREGISTERED');
      } else if (['QUOTA', 'UNAVAILABLE', 'TIMEOUT'].includes(failure.reason) && job.attempts < 8) {
        const delay = retryDelay(job.attempts, failure.reason === 'QUOTA', failure.retryAfterMs);
        await this.db.query(
          `UPDATE notification_push_deliveries SET
          status=CASE WHEN expires_at<=clock_timestamp()+$3*interval '1 millisecond' THEN 'SKIPPED' ELSE 'PENDING' END,
          completed_at=CASE WHEN expires_at<=clock_timestamp()+$3*interval '1 millisecond' THEN clock_timestamp() ELSE NULL END,
          next_attempt_at=clock_timestamp()+$3*interval '1 millisecond',last_error_code=$4,lease_token=NULL,lease_until=NULL
          WHERE id=$1 AND status='RUNNING' AND lease_token=$2 AND lease_until>clock_timestamp()`,
          [job.id, job.lease_token, delay, failure.reason],
        );
      } else await this.finish(job, 'DEAD', failure.reason);
      this.logger.warn(
        JSON.stringify({
          event: 'PUSH_SEND_FAILED',
          deliveryId: job.id,
          reason: failure.reason,
          attempt: job.attempts,
        }),
      );
    } finally {
      clearInterval(heartbeat);
    }
  }
  async finish(
    job: PushJob,
    status: 'SENT' | 'SKIPPED' | 'DEAD',
    reason: string | null,
    providerId: string | null = null,
  ): Promise<void> {
    // Provider IDs are metadata, never arbitrary raw response text.
    const safeId =
      providerId && /^projects\/[a-z0-9-]+\/messages\/[A-Za-z0-9:%._-]+$/.test(providerId)
        ? providerId.slice(0, 256)
        : null;
    await this.db.query(
      `UPDATE notification_push_deliveries SET status=$3,last_error_code=$4,provider_message_id=$5,
      completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL
      WHERE id=$1 AND status='RUNNING' AND lease_token=$2 AND lease_until>clock_timestamp()`,
      [job.id, job.lease_token, status, reason, safeId],
    );
  }
  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    await this.running;
  }
}
