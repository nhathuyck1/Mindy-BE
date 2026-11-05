import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource } from 'typeorm';
// biome-ignore lint/style/useImportType: Nest DI token.
import { PushCrypto } from './push-crypto.service.js';
import type { InstallationRow } from './push-registry.service.js';

@Injectable()
export class PushMaintenance {
  constructor(
    private readonly db: DataSource,
    private readonly crypto: PushCrypto,
  ) {}
  async metrics(): Promise<object> {
    const deliveries: object[] =
      await this.db.query(`SELECT status,last_error_code,count(*)::text AS count,
      min(created_at) AS oldest,sum(attempts)::text AS attempts FROM notification_push_deliveries GROUP BY status,last_error_code`);
    const installations: object[] = await this.db.query(
      'SELECT status,key_version,count(*)::text AS count FROM push_installations GROUP BY status,key_version',
    );
    return { deliveries, installations };
  }
  async run(
    command: 'replay' | 'retention' | 'rotate',
    limit: number,
    apply = false,
  ): Promise<object> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('Expected limit 1..100');
    return this.db.transaction(async (m) => {
      if (command === 'replay') {
        // Only configuration/transient failures; never revive expired or invalid deliveries.
        const rows: { id: string }[] = await m.query(
          `SELECT d.id FROM notification_push_deliveries d
          JOIN push_installations i ON i.id=d.installation_id JOIN notifications n ON n.id=d.notification_id
          JOIN auth_sessions s ON s.id=i.session_id WHERE d.status='DEAD' AND d.expires_at>clock_timestamp()
          AND d.last_error_code IN ('CONFIGURATION','UNAVAILABLE','QUOTA','TIMEOUT','PROVIDER_ERROR')
          AND i.generation=d.installation_generation AND i.user_id=n.user_id AND i.status='ACTIVE'
          AND n.read_at IS NULL AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
          ORDER BY d.id FOR UPDATE OF d SKIP LOCKED LIMIT $1`,
          [limit],
        );
        if (apply)
          await m.query(
            `UPDATE notification_push_deliveries SET status='PENDING',attempts=0,completed_at=NULL,
          next_attempt_at=clock_timestamp(),last_error_code=NULL WHERE id=ANY($1::uuid[])`,
            [rows.map((r) => r.id)],
          );
        return { dryRun: !apply, eligible: rows.length };
      }
      if (command === 'rotate') {
        const rows: InstallationRow[] = await m.query(
          'SELECT * FROM push_installations WHERE key_version<>$2 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $1',
          [limit, this.crypto.active],
        );
        let changed = 0;
        for (const r of rows) {
          const encrypted = this.crypto.encrypt(r.id, this.crypto.decrypt(r.id, r));
          if (encrypted.key_version === r.key_version) continue;
          changed++;
          if (apply)
            await m.query(
              `UPDATE push_installations SET token_ciphertext=$2,nonce=$3,auth_tag=$4,key_version=$5
            WHERE id=$1`,
              [
                r.id,
                encrypted.token_ciphertext,
                encrypted.nonce,
                encrypted.auth_tag,
                encrypted.key_version,
              ],
            );
        }
        return { dryRun: !apply, eligible: changed };
      }
      const terminal: { id: string }[] = await m.query(
        `SELECT id FROM notification_push_deliveries
        WHERE completed_at<clock_timestamp()-interval '30 days' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $1`,
        [limit],
      );
      const stale: { id: string }[] = await m.query(
        `SELECT id FROM push_installations WHERE status='ACTIVE'
        AND last_seen_at<clock_timestamp()-interval '30 days' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $1`,
        [limit],
      );
      const tokens: { id: string }[] = await m.query(
        `SELECT i.id FROM push_installations i WHERE i.status<>'ACTIVE'
        AND i.revoked_at<clock_timestamp()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM notification_push_deliveries d WHERE d.installation_id=i.id)
        ORDER BY i.id FOR UPDATE SKIP LOCKED LIMIT $1`,
        [limit],
      );
      if (apply) {
        await m.query('DELETE FROM notification_push_deliveries WHERE id=ANY($1::uuid[])', [
          terminal.map((r) => r.id),
        ]);
        await m.query(
          "UPDATE push_installations SET status='STALE',revoked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=ANY($1::uuid[])",
          [stale.map((r) => r.id)],
        );
        await m.query('DELETE FROM push_installations WHERE id=ANY($1::uuid[])', [
          tokens.map((r) => r.id),
        ]);
        await m.query(
          "DELETE FROM push_mutation_events WHERE ctid IN (SELECT ctid FROM push_mutation_events WHERE created_at<clock_timestamp()-interval '1 minute' LIMIT $1)",
          [limit],
        );
      }
      return {
        dryRun: !apply,
        deliveries: terminal.length,
        stale: stale.length,
        tokens: tokens.length,
      };
    });
  }
}
