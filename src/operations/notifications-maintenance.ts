import 'dotenv/config';
import { isUUID } from 'class-validator';
import db from '../database/data-source.js';

/** No HTTP server/workers are started. Writes require an explicit --apply flag. */
const command = process.argv[2] ?? 'status',
  apply = process.argv.includes('--apply');
const option = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const producer = option('producer'),
  eventId = option('event'),
  limit = Number(option('limit') ?? 100);
if (
  !['status', 'activate', 'replay', 'retention'].includes(command) ||
  !Number.isSafeInteger(limit) ||
  limit < 1 ||
  limit > 1000
)
  throw new Error('Expected status|activate|replay|retention, --limit=1..1000');
if (
  command === 'activate' &&
  !['SCHEDULE', 'ASSIGNMENT', 'PAYMENT', 'LEAVE_MAKEUP', 'MATERIAL', 'REMINDER'].includes(
    producer ?? '',
  )
)
  throw new Error('Specify --producer=SCHEDULE|ASSIGNMENT|PAYMENT|LEAVE_MAKEUP|MATERIAL|REMINDER');
if (command === 'replay' && (!eventId || !isUUID(eventId, '4')))
  throw new Error('Replay requires --event=UUIDv4');
await db.initialize();
try {
  if (command === 'status') {
    const producers = await db.query(
      'SELECT name,activated_at FROM notification_producers ORDER BY name',
    );
    const jobs = await db.query(
      `SELECT status,count(*)::int AS count,min(occurred_at) AS oldest FROM notification_events GROUP BY status`,
    );
    console.log(JSON.stringify({ producers, jobs }));
  } else if (command === 'activate') {
    const rows = await db.transaction(async (m) => {
      const current = await m.query(
        'SELECT name,activated_at FROM notification_producers WHERE name=$1 FOR UPDATE',
        [producer],
      );
      if (apply)
        await m.query(
          'UPDATE notification_producers SET activated_at=COALESCE(activated_at,clock_timestamp()) WHERE name=$1',
          [producer],
        );
      return current;
    });
    console.log(JSON.stringify({ dryRun: !apply, producerStateBefore: rows }));
  } else if (command === 'replay') {
    const result = await db.transaction(async (m) => {
      const rows: { id: string; eligible: boolean }[] = await m.query(
        `SELECT e.id,
        (e.occurred_at>=clock_timestamp()-interval '90 days' AND p.activated_at IS NOT NULL
          AND e.occurred_at>=p.activated_at AND e.epoch=p.epoch AND e.status='DEAD') AS eligible
        FROM notification_events e JOIN notification_producers p ON p.name=e.producer WHERE e.id=$1 FOR UPDATE OF e`,
        [eventId],
      );
      if (!rows[0]?.eligible)
        throw new Error(
          'Only dead events in the active epoch and 90-day replay window may be retried',
        );
      if (apply)
        await m.query(
          `UPDATE notification_events SET status='PENDING',attempts=0,lease_id=NULL,lease_until=NULL,available_at=clock_timestamp(),last_error=NULL WHERE id=$1`,
          [eventId],
        );
      return rows;
    });
    console.log(JSON.stringify({ dryRun: !apply, events: result }));
  } else {
    const result = await db.transaction(async (m) => {
      const rows: { id: string }[] = await m.query(
        `SELECT id FROM notifications WHERE event_id IS NOT NULL
        AND created_at<clock_timestamp()-interval '90 days' ORDER BY created_at,id LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [limit],
      );
      if (apply)
        await m.query('DELETE FROM notifications WHERE id=ANY($1::uuid[])', [
          rows.map((r) => r.id),
        ]);
      // Event/recipient markers deliberately survive inbox retention and prevent unread resurrection.
      return { count: rows.length };
    });
    console.log(JSON.stringify({ dryRun: !apply, ...result }));
  }
} finally {
  await db.destroy();
}
