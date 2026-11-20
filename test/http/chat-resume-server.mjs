// Test-only restart fixture. Never resets or seeds an existing database.
import 'reflect-metadata';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

if (
  process.env.NODE_ENV !== 'test' ||
  !/\/\w+_http_test$/.test(new URL(process.env.DATABASE_URL).pathname)
)
  throw new Error('Chat resume requires a dedicated HTTP test database');
const { AppModule } = await import('../../dist/app.module.js');
const { configureApp } = await import('../../dist/configure-app.js');
const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
const app = moduleRef.createNestApplication({ logger: ['error'], bodyParser: false });
configureApp(app);
const db = app.get(DataSource);
const { ChatSocketService } = await import(
  '../../dist/modules/chat/services/chat-socket.service.js'
);
const { ChatNotificationsService } = await import(
  '../../dist/modules/chat/services/chat-notifications.service.js'
);
const sockets = app.get(ChatSocketService);
const context = new AsyncLocalStorage();
let armed, unblock;
const valid = sockets.valid.bind(sockets);
sockets.valid = async (socket) => {
  const delivery = context.getStore();
  if (
    armed &&
    delivery?.event === armed.event &&
    delivery.conversationId === armed.conversationId &&
    socket.data.principal.userId === armed.userId
  ) {
    const barrier = armed;
    armed = undefined;
    process.send?.({ type: 'delivery-before-authorize' });
    await barrier.wait;
  }
  return valid(socket);
};
const dispatch = sockets.dispatch.bind(sockets);
sockets.dispatch = async (job) => {
  const [event] = await db.query('SELECT type FROM chat_events WHERE id=$1', [job.event_id]);
  return context.run({ event: event?.type, conversationId: job.conversation_id }, () =>
    dispatch(job),
  );
};
const broadcast = sockets.broadcast.bind(sockets);
sockets.broadcast = (...args) =>
  context.run({ event: args[1], conversationId: args[0] }, () => broadcast(...args));
const own = sockets.own.bind(sockets);
sockets.own = (...args) =>
  context.run({ event: args[1], conversationId: args[3] }, () => own(...args));
if (!(await db.query("SELECT 1 FROM migrations WHERE name='ChatAttachments1792800000002'")).length)
  throw new Error('Restart fixture requires an already migrated database');
await app.listen(0, '127.0.0.1');
process.send?.({ url: await app.getUrl() });
process.on('message', async (msg) => {
  if (msg?.type === 'arm-delivery') {
    armed = {
      ...msg,
      wait: new Promise((resolve) => {
        unblock = resolve;
      }),
    };
    process.send?.({ type: 'delivery-armed' });
  }
  if (msg?.type === 'delivery-fence') {
    for (const socket of sockets.sockets.values())
      if (socket.data.principal.userId === msg.userId) socket.emit('fixture:delivery-fence', {});
  }
  if (msg === 'release-delivery') {
    armed = undefined;
    unblock?.();
    unblock = undefined;
  }
  if (msg === 'stop-workers') {
    const { ChatWorkerService } = await import(
      '../../dist/modules/chat/services/chat-worker.service.js'
    );
    await app.get(ChatWorkerService).onApplicationShutdown();
    process.send?.({ type: 'workers-stopped' });
  }
  if (msg?.type === 'fanout-once') {
    const [job] = await db.query('SELECT * FROM chat_jobs WHERE id=$1', [msg.jobId]);
    if (!job) throw new Error('Missing notification job');
    const notifications = app.get(ChatNotificationsService);
    await notifications.fanout(job);
    for (const delivery of await notifications.deliveries(job))
      await sockets.own(
        delivery.userId,
        'notification:created',
        { notification: delivery.notification },
        delivery.notification.conversationId,
      );
    process.send?.({ type: 'notification-delivered' });
  }
  if (msg?.type === 'reconcile') {
    const { ChatLifecycleService } = await import(
      '../../dist/modules/chat/services/chat-lifecycle.service.js'
    );
    await app.get(ChatLifecycleService).reconcileClass(msg.classId);
    process.send?.({ type: 'reconciled' });
  }
  if (msg?.type === 'hold-send-ack') {
    const { ChatService } = await import('../../dist/modules/chat/services/chat.service.js');
    const chat = app.get(ChatService),
      original = chat.send.bind(chat);
    chat.send = async (...args) => {
      const result = await original(...args);
      if (args[2].clientMessageId === msg.clientMessageId) {
        process.send?.({ type: 'send-persisted', messageId: result.message.id });
        await new Promise(() => {});
      }
      return result;
    };
    process.send?.({ type: 'ack-trap-ready' });
  }
  if (msg?.type === 'dispatch-before-complete') {
    const { ChatSocketService } = await import(
      '../../dist/modules/chat/services/chat-socket.service.js'
    );
    const rows = await db.query(
      `WITH claimed AS (UPDATE chat_jobs SET status='RUNNING',attempts=attempts+1,lease_token=$2,
      lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1 AND status='PENDING' RETURNING *) SELECT * FROM claimed`,
      [msg.jobId, randomUUID()],
    );
    if (!rows[0]) throw new Error('Missing dispatch job');
    await app.get(ChatSocketService).dispatch(rows[0]);
    process.send?.({ type: 'dispatched-before-complete' });
  }
  if (msg === 'start-workers') {
    const { ChatWorkerService } = await import(
      '../../dist/modules/chat/services/chat-worker.service.js'
    );
    app.get(ConfigService).set('CHAT_JOB_ENABLED', true);
    app.get(ChatWorkerService).onApplicationBootstrap();
    process.send?.({ type: 'workers-started' });
  }
  if (msg === 'close') {
    await app.close();
    process.exit(0);
  }
});
