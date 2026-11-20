import type { DataSource, EntityManager } from 'typeorm';

/** Count, page and evidence are read from one snapshot without acquiring writer locks. */
export async function inReadSnapshot<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction('REPEATABLE READ', async (manager) => {
    await manager.query('SET TRANSACTION READ ONLY');
    return work(manager);
  });
}
