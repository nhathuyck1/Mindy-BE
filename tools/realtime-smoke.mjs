import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startRealtimeTestServer } from './realtime-test-server.mjs';

const origin = 'https://portable-frontend.test';
const server = await startRealtimeTestServer([origin]);
const sockets = [];
const access = server.tokens.signAccessToken(server.actor);
async function issue(channel, cookie = `access_token=${access.token}`, site = origin) {
  return fetch(`${server.url}/api/v1/auth/realtime-ticket`, {
    method: 'POST',
    headers: { Origin: site, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel }),
  });
}
async function connect(channel, ticket, site = origin) {
  const socket = io(server.url + (channel === 'chat' ? '/chat' : ''), {
    path: channel === 'chat' ? '/socket.io' : '/ws/whiteboards',
    addTrailingSlash: false,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { ticket },
    extraHeaders: { origin: site },
    timeout: 3000,
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}
try {
  assert.equal((await issue('chat', '')).status, 401);
  assert.equal((await issue('chat', undefined, 'https://evil.test')).status, 403);
  assert.equal((await issue('admin')).status, 422);
  const admin = server.tokens.signAccessToken({ ...server.actor, role: 'ADMIN' });
  assert.equal((await issue('chat', `access_token=${admin.token}`)).status, 403);
  const whiteboardResponse = await issue('whiteboards');
  assert.equal(whiteboardResponse.status, 200);
  assert.equal(whiteboardResponse.headers.get('cache-control'), 'private, no-store');
  const whiteboard = await whiteboardResponse.json();
  const chat = await (await issue('chat')).json();
  const boardSocket = await connect('whiteboards', whiteboard.ticket);
  const joinedBoard = await boardSocket
    .timeout(3000)
    .emitWithAck('board:join', { boardId: server.board.id });
  assert.equal(joinedBoard.ok, true);
  const chatSocket = await connect('chat', chat.ticket);
  assert.equal(
    (
      await chatSocket
        .timeout(3000)
        .emitWithAck('conversation:join', { conversationId: server.board.id })
    ).ok,
    true,
  );
  await assert.rejects(connect('chat', whiteboard.ticket));
  await assert.rejects(connect('whiteboards', chat.ticket));
  await assert.rejects(connect('chat', chat.ticket, 'https://evil.test'));
  assert.throws(() =>
    server.tokens.signRealtimeTicket(server.actor, new Date(Date.now() - 1), origin, 'chat'),
  );
  server.revoke();
  assert.equal((await issue('chat')).status, 401);
  await assert.rejects(connect('chat', chat.ticket));
} finally {
  for (const socket of sockets) socket.disconnect();
  await server.close();
}
console.log(
  'PASS: real HTTP guards, role/origin validation, cookie-free chat + board joins, channel/origin isolation. Domain/session lookup uses an in-memory fixture.',
);
