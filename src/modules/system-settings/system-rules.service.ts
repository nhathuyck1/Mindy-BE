import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import { SESSION_START_TIME_RULE } from './system-settings.js';

export interface SystemRule {
  key: string;
  value: boolean;
  version: number;
  updatedAt: Date;
  updatedBy: string | null;
}
const columns = 'key,value,version,updated_at AS "updatedAt",updated_by AS "updatedBy"';

@Injectable()
export class SystemRulesService {
  constructor(private readonly db: DataSource) {}

  async list(): Promise<SystemRule[]> {
    return this.db.query(`SELECT ${columns} FROM system_rules WHERE key=$1 ORDER BY key`, [
      SESSION_START_TIME_RULE,
    ]);
  }

  async update(
    key: string,
    input: { value: boolean; expectedVersion: number; reason: string },
    actorId: string,
  ): Promise<SystemRule> {
    if (key !== SESSION_START_TIME_RULE) throw new NotFoundException('Unknown system rule');
    return this.db.transaction(async (m) => {
      const rows: SystemRule[] = await m.query(
        `SELECT ${columns} FROM system_rules WHERE key=$1 FOR UPDATE`,
        [key],
      );
      const old = rows[0];
      if (!old) throw new NotFoundException('Unknown system rule');
      if (old.version !== input.expectedVersion)
        throw new ConflictException('Rule changed; reload before editing');
      const updated: SystemRule[] = await m.query(
        `UPDATE system_rules SET value=$2,version=version+1,updated_at=clock_timestamp(),updated_by=$3 WHERE key=$1 RETURNING ${columns}`,
        [key, input.value, actorId],
      );
      await m.query(
        `INSERT INTO system_rule_audits(rule_key,old_value,new_value,actor_id,reason,version) VALUES($1,$2,$3,$4,$5,$6)`,
        [key, old.value, input.value, actorId, input.reason, old.version + 1],
      );
      const result = updated[0];
      if (!result) throw new Error('Updated rule missing');
      return result;
    });
  }
}
