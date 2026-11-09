import type { EntityManager } from 'typeorm';

export const SESSION_START_TIME_RULE = 'session_start_time_enforced';

/** Read committed settings without a process cache. Missing keys keep the rule enabled. */
export async function sessionStartTimeEnforced(m: EntityManager): Promise<boolean> {
  const rows: { value: boolean }[] = await m.query('SELECT value FROM system_rules WHERE key=$1', [
    SESSION_START_TIME_RULE,
  ]);
  return rows[0]?.value !== false;
}
