import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sendFcmHttp } from '../../dist/modules/push-notifications/fcm.adapter.js';

const base = process.argv[2];
if (!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/fcm$/.test(base))
  throw new Error('Expected local simulation URL ending /fcm');
for (const [status, reason] of [
  [200, null],
  [400, 'INVALID_PAYLOAD'],
  [403, 'CONFIGURATION'],
  [404, 'UNREGISTERED'],
  [429, 'QUOTA'],
  [503, 'UNAVAILABLE'],
]) {
  const message = {
    token: `simulate-${status}`,
    notification: { title: 'Tin nhắn mới', body: 'Bạn có tin nhắn mới.' },
    data: { schemaVersion: '1', notificationId: randomUUID() },
    webpush: {
      headers: { TTL: '300' },
      notification: { tag: randomUUID() },
      fcmOptions: { link: 'https://app.example.test/notifications' },
    },
  };
  if (!reason)
    assert.equal(
      await sendFcmHttp('mindy-test', 'simulation-only', message, base),
      'projects/mindy-test/messages/simulated',
    );
  else
    await assert.rejects(sendFcmHttp('mindy-test', 'simulation-only', message, base), (error) => {
      assert.equal(error.reason, reason);
      if (status === 429) assert.ok(error.retryAfterMs >= 60000);
      if (status === 503) assert.equal(error.retryAfterMs, 90000);
      return true;
    });
}
console.log(
  'FCM HTTP v1 simulation: 6/6 PASS (generic payload, REST casing, auth header, errors, Retry-After)',
);
