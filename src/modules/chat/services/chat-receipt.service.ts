import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ChatException } from '../exceptions/chat.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatCryptoService } from './chat-crypto.service.js';

interface ReceiptOutcome {
  readonly resourceId: string;
  readonly keyVersion: number;
  readonly fingerprintVersion: 1;
}

/** Caller locks the conversation before lookup/insert; receipts never contain a body snapshot. */
@Injectable()
export class ChatReceiptService {
  constructor(private readonly crypto: ChatCryptoService) {}
  async lookup(
    manager: EntityManager,
    actorId: string,
    route: string,
    key: string,
    request: readonly unknown[],
  ): Promise<string | null> {
    const rows: { payload_hash: string; outcome: ReceiptOutcome }[] = await manager.query(
      `SELECT payload_hash,outcome FROM mutation_receipts
       WHERE namespace='chat' AND actor_id=$1 AND route=$2 AND key=$3`,
      [actorId, route, key],
    );
    const receipt = rows[0];
    if (!receipt) return null;
    if (
      receipt.outcome.fingerprintVersion !== 1 ||
      !this.crypto.matches(request, receipt.payload_hash, receipt.outcome.keyVersion)
    )
      throw new ChatException(409, 'CHAT_IDEMPOTENCY_CONFLICT');
    return receipt.outcome.resourceId;
  }
  async insert(
    manager: EntityManager,
    actorId: string,
    route: string,
    key: string,
    request: readonly unknown[],
    resourceId: string,
  ): Promise<void> {
    const keyVersion = this.crypto.activeKeyVersion;
    await manager.query(
      `INSERT INTO mutation_receipts(namespace,actor_id,route,key,payload_hash,outcome)
      VALUES('chat',$1,$2,$3,$4,$5::jsonb)`,
      [
        actorId,
        route,
        key,
        this.crypto.fingerprint(request, keyVersion),
        JSON.stringify({ resourceId, keyVersion, fingerprintVersion: 1 }),
      ],
    );
  }
}
