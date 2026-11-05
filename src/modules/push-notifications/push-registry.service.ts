import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource, type EntityManager } from 'typeorm';
import { AppHttpException } from '../../common/http/app-http.exception.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { AuthService } from '../auth/auth.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { PushConfig } from './push-config.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { type EncryptedPushToken, PushCrypto } from './push-crypto.service.js';

export interface InstallationRow extends EncryptedPushToken {
  id: string;
  user_id: string;
  session_id: string;
  token_fingerprint: Buffer;
  generation: string;
  status: string;
  last_seen_at: Date;
}
export class PushInstallationDto {
  installationId!: string;
  platform!: 'WEB';
  status!: 'ACTIVE';
  generation!: string;
  lastSeenAt!: string;
}
export function pushError(status: number, code: string): AppHttpException {
  return new AppHttpException(status, code, code);
}
@Injectable()
export class PushRegistry {
  constructor(
    private readonly db: DataSource,
    private readonly config: PushConfig,
    private readonly crypto: PushCrypto,
    private readonly auth: AuthService,
  ) {}
  private enabled(): void {
    if (!this.config.enabled) throw pushError(503, 'PUSH_DISABLED');
  }
  private async lockActor(m: EntityManager, actor: AuthenticatedUser): Promise<void> {
    // Session before registry: same order as the auth revoke trigger. Serialize quota per owner.
    await this.auth.assertAccessPrincipalValid(actor, m);
    await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,7101))', [actor.userId]);
  }
  private async reserve(actor: AuthenticatedUser): Promise<void> {
    await this.db.transaction(async (m) => {
      await this.auth.assertAccessPrincipalValid(actor, m);
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,7102))', [actor.sessionId]);
      const budget: { count: string }[] = await m.query(
        `SELECT count(*)::text AS count FROM push_mutation_events
      WHERE session_id=$1 AND created_at>clock_timestamp()-interval '1 minute'`,
        [actor.sessionId],
      );
      if (Number(budget[0]?.count) >= 20) throw pushError(429, 'PUSH_RATE_LIMITED');
      await this.record(m, actor);
    });
  }
  async put(actor: AuthenticatedUser, id: string, token: string): Promise<PushInstallationDto> {
    this.enabled();
    await this.reserve(actor);
    id = id.toLowerCase();
    try {
      return await this.db.transaction(async (m) => {
        await this.lockActor(m, actor);
        const fingerprint = this.crypto.fingerprint(token);
        const prior: InstallationRow[] = await m.query(
          'SELECT * FROM push_installations WHERE id=$1 FOR UPDATE',
          [id],
        );
        const row = prior[0];
        if (row && row.user_id !== actor.userId) throw pushError(409, 'PUSH_BINDING_CONFLICT');
        const others: { id: string }[] = await m.query(
          'SELECT id FROM push_installations WHERE token_fingerprint=$1 AND id<>$2',
          [fingerprint, id],
        );
        if (others.length) throw pushError(409, 'PUSH_BINDING_CONFLICT');
        if (row?.status !== 'ACTIVE') {
          const counts: { count: string }[] = await m.query(
            "SELECT count(*)::text AS count FROM push_installations WHERE user_id=$1 AND status='ACTIVE'",
            [actor.userId],
          );
          if (Number(counts[0]?.count) >= 10) throw pushError(409, 'PUSH_INSTALLATION_LIMIT');
        }
        const same =
          row?.status === 'ACTIVE' &&
          row.session_id === actor.sessionId &&
          row.token_fingerprint.equals(fingerprint);
        const encrypted = this.crypto.encrypt(id, token);
        const result: InstallationRow[] = await m.query(
          `INSERT INTO push_installations
          (id,user_id,session_id,token_ciphertext,nonce,auth_tag,key_version,token_fingerprint)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET session_id=EXCLUDED.session_id,
          token_ciphertext=EXCLUDED.token_ciphertext,nonce=EXCLUDED.nonce,auth_tag=EXCLUDED.auth_tag,
          key_version=EXCLUDED.key_version,token_fingerprint=EXCLUDED.token_fingerprint,
          generation=push_installations.generation+CASE WHEN $9 THEN 0 ELSE 1 END,
          generation_started_at=CASE WHEN $9 THEN push_installations.generation_started_at ELSE clock_timestamp() END,
          status='ACTIVE',revoked_at=NULL,last_seen_at=clock_timestamp(),updated_at=clock_timestamp()
          WHERE push_installations.user_id=EXCLUDED.user_id RETURNING *`,
          [
            id,
            actor.userId,
            actor.sessionId,
            encrypted.token_ciphertext,
            encrypted.nonce,
            encrypted.auth_tag,
            encrypted.key_version,
            fingerprint,
            same ?? false,
          ],
        );
        const updated = result[0];
        if (!updated) throw pushError(409, 'PUSH_BINDING_CONFLICT');
        return {
          installationId: updated.id,
          platform: 'WEB',
          status: 'ACTIVE',
          generation: updated.generation,
          lastSeenAt: updated.last_seen_at.toISOString(),
        };
      });
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && e.code === '23505')
        throw pushError(409, 'PUSH_BINDING_CONFLICT');
      throw e;
    }
  }
  async revoke(actor: AuthenticatedUser, id: string, generation: string): Promise<void> {
    this.enabled();
    await this.reserve(actor);
    await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const rows: InstallationRow[] = await m.query(
        'SELECT * FROM push_installations WHERE id=$1 AND user_id=$2 AND session_id=$3 FOR UPDATE',
        [id, actor.userId, actor.sessionId],
      );
      const row = rows[0];
      if (!row) throw pushError(404, 'PUSH_INSTALLATION_NOT_FOUND');
      if (row.generation !== generation) throw pushError(409, 'PUSH_GENERATION_CONFLICT');
      await m.query(
        "UPDATE push_installations SET status='REVOKED',revoked_at=COALESCE(revoked_at,clock_timestamp()),updated_at=clock_timestamp() WHERE id=$1",
        [id],
      );
    });
  }
  private async record(m: EntityManager, actor: AuthenticatedUser): Promise<void> {
    await m.query('INSERT INTO push_mutation_events(session_id) VALUES($1)', [actor.sessionId]);
  }
}
