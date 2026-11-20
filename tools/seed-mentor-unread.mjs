import 'dotenv/config';
import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

// This seed is deliberately limited to the existing local demo database/account.
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/mindy_center')
  throw new Error('Seed requires local mindy_center database');
for (const key of Object.keys(process.env)) {
  if (key.endsWith('_JOB_ENABLED') || key.endsWith('_WORKER_ENABLED')) process.env[key] = 'false';
}
process.env.DATABASE_LOGGING = 'false';
process.env.NOTIFICATION_SOCKET_ENABLED = 'false';

const { AppModule } = await import('../dist/app.module.js');
const { ChatAccessService } = await import('../dist/modules/chat/services/chat-access.service.js');
const { ChatCryptoService } = await import('../dist/modules/chat/services/chat-crypto.service.js');
const { ChatEventService } = await import('../dist/modules/chat/services/chat-event.service.js');
const { ChatLifecycleService } = await import(
  '../dist/modules/chat/services/chat-lifecycle.service.js'
);
const { ChatService } = await import('../dist/modules/chat/services/chat.service.js');
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

function seedId(scope, index) {
  const bytes = createHash('sha256').update(`mentor-unread-20261120/${scope}/${index}`).digest();
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

try {
  const db = app.get(DataSource),
    access = app.get(ChatAccessService),
    crypto = app.get(ChatCryptoService),
    events = app.get(ChatEventService);
  if (!app.get(ConfigService).get('CHAT_ENABLED')) throw new Error('Local chat must be enabled');
  const [mentor] = await db.query(
    "SELECT id,email,role FROM users WHERE email='mentor.frontend@example.com' AND status='ACTIVE' AND role='MENTOR'",
  );
  if (!mentor) throw new Error('Active demo mentor missing');
  const [scope] = await db.query(
    `SELECT c.id AS class_id,c.code,c.name,u.id AS student_id,u.email AS student_email,cc.id AS conversation_id
    FROM classes c JOIN enrollments e ON e.class_id=c.id AND e.status='ACTIVE'
    JOIN users u ON u.id=e.student_id AND u.status='ACTIVE' AND u.role='STUDENT'
    JOIN chat_conversations cc ON cc.class_id=c.id AND cc.type='CLASS'
    WHERE c.mentor_id=$1 AND c.status='IN_PROGRESS' AND c.code LIKE 'JS-101-FE-DEMO-%'
    ORDER BY (u.email='student.an@example.com') DESC,c.created_at DESC,u.email LIMIT 1`,
    [mentor.id],
  );
  if (!scope) throw new Error('Active JavaScript demo class/student missing');
  const direct = await app.get(ChatLifecycleService).ensureDirect(mentor.id, scope.student_id);
  const mentorActor = { userId: mentor.id, role: 'MENTOR', sessionId: randomUUID() };
  const sender = { userId: scope.student_id, role: 'STUDENT', sessionId: randomUUID() };
  const conversations = [
    { id: scope.conversation_id, kind: 'GROUP', label: scope.name },
    { id: direct.id, kind: 'DIRECT', label: scope.student_email },
  ];
  const inserted = await db.transaction(async (m) => {
    await m.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('seed-mentor-unread-20261120',6))",
    );
    const counts = {};
    for (const conversation of conversations) {
      const authorized = await access.authorize(m, sender, conversation.id, true, true);
      await access.authorize(m, mentorActor, conversation.id);
      const recipients = await access.recipients(m, authorized.conversation);
      if (!recipients.includes(mentor.id)) throw new Error('Mentor is not a current recipient');
      let added = 0;
      for (let i = 1; i <= 100; i++) {
        const clientId = seedId(conversation.id, i);
        const prior = await m.query(
          'SELECT id FROM chat_messages WHERE conversation_id=$1 AND sender_id=$2 AND client_message_id=$3',
          [conversation.id, sender.userId, clientId],
        );
        if (prior.length) continue;
        const messageId = randomUUID(),
          sequence = await events.nextSequence(m, conversation.id);
        await crypto.reserveEncryption(m);
        const encrypted = crypto.encrypt(
          { messageId, conversationId: conversation.id, senderId: sender.userId },
          `[SEED 99+] Tin nhắn kiểm tra ${conversation.kind === 'GROUP' ? 'nhóm lớp' : 'cá nhân'} ${i}/100 cho mentor.frontend.`,
        );
        await m.query(
          `INSERT INTO chat_messages(id,conversation_id,sender_id,client_message_id,sequence,last_changed_seq,
            ciphertext,iv,tag,key_version,crypto_version,type,body_is_null)
          VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,1,'TEXT',false)`,
          [
            messageId,
            conversation.id,
            sender.userId,
            clientId,
            sequence,
            encrypted.ciphertext,
            encrypted.iv,
            encrypted.tag,
            encrypted.keyVersion,
          ],
        );
        await events.append(m, {
          conversationId: conversation.id,
          sequence,
          type: 'message:created',
          messageId,
          actorId: sender.userId,
          recipientIds: recipients,
        });
        added++;
      }
      counts[conversation.kind] = added;
    }
    return counts;
  });
  const evidence = [];
  for (const conversation of conversations) {
    // Domain projection verifies access, the unread counter and real decryption,
    // without advancing the mentor's read cursor.
    const dto = await app.get(ChatService).get(mentorActor, conversation.id);
    if (dto.unreadCount < 100 || !dto.lastMessage?.body?.startsWith('[SEED 99+]'))
      throw new Error('Unread/decryption verification failed');
    evidence.push({
      conversationId: dto.id,
      type: dto.type,
      label: conversation.label,
      unreadCount: dto.unreadCount,
      lastReadSequence: dto.lastReadSequence,
    });
  }
  console.log(
    JSON.stringify(
      {
        database: 'local/mindy_center',
        account: mentor.email,
        sender: scope.student_email,
        classCode: scope.code,
        inserted,
        evidence,
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
}
