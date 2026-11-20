import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/** UPDATE itself takes the conversation row lock. All message mutations hold it until commit. */
@Injectable()
export class ChatEventService {
  async nextSequence(manager: EntityManager, conversationId: string): Promise<string> {
    const rows: { sequence: string }[] = await manager.query(
      `WITH changed AS (UPDATE chat_conversations
      SET last_event_seq=last_event_seq+1,updated_at=clock_timestamp() WHERE id=$1
      RETURNING last_event_seq::text AS sequence) SELECT * FROM changed`,
      [conversationId],
    );
    const sequence = rows[0]?.sequence;
    if (!sequence) throw new Error('Conversation missing during sequence allocation');
    return sequence;
  }
  async append(
    manager: EntityManager,
    event: {
      conversationId: string;
      sequence: string;
      type: string;
      messageId: string | null;
      actorId: string | null;
      recipientIds: readonly string[];
    },
  ): Promise<string> {
    const id = randomUUID();
    await manager.query(
      `INSERT INTO chat_events(id,conversation_id,sequence,type,message_id,actor_id)
      VALUES($1,$2,$3,$4,$5,$6)`,
      [id, event.conversationId, event.sequence, event.type, event.messageId, event.actorId],
    );
    for (const consumer of ['REALTIME', 'NOTIFICATION']) {
      await manager.query(
        `INSERT INTO chat_jobs(consumer,event_id,conversation_id,recipient_ids)
        VALUES($1,$2,$3,$4)`,
        [consumer, id, event.conversationId, [...new Set(event.recipientIds)].sort()],
      );
    }
    return id;
  }
}
