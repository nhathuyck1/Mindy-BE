import type { DataSource } from 'typeorm';
import { CHAT_MIGRATIONS } from './chat-migrations.js';
import { paymentDatabase } from './payment-fixture.js';

/** Full executable catalog; paymentDatabase enforces a dedicated _test database. */
export async function chatDatabase(withLifecycle = true): Promise<DataSource> {
  return paymentDatabase('phase6', {
    migrations: CHAT_MIGRATIONS.filter(
      (m) =>
        m.name !== 'MentorLeave1792195200000' &&
        (withLifecycle ||
          !['ChatLifecycle1792800000001', 'ChatAttachments1792800000002'].includes(m.name)),
    ),
  });
}
