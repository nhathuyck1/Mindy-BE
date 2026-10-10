import type { DataSource, EntityManager } from 'typeorm';

/**
 * Runs several reads (count + page) against one consistent snapshot. GET handlers never lock
 * or write; settlement/expiry may commit right after the response and detail endpoints re-check.
 */
export async function inReadSnapshot<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction('REPEATABLE READ', async (manager) => {
    await manager.query('SET TRANSACTION READ ONLY');
    return work(manager);
  });
}
