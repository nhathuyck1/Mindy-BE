import { Injectable } from '@nestjs/common';
import { ChatException } from '../exceptions/chat.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatCryptoService } from './chat-crypto.service.js';

interface CursorData {
  scope: string;
  actor: string;
  position: string;
  watermark: string;
  keyVersion: number;
}
@Injectable()
export class ChatCursorService {
  position(value: string): readonly [string | null, string | null] {
    if (!value) return [null, null];
    const [time, id, ...rest] = value.split('|');
    if (
      !time ||
      !id ||
      rest.length ||
      !Number.isFinite(Date.parse(time)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    )
      throw new ChatException(422, 'CHAT_CURSOR_INVALID');
    return [time, id];
  }
  constructor(private readonly crypto: ChatCryptoService) {}
  encode(actor: string, scope: string, position: string, watermark: string): string {
    const data = { actor, scope, position, watermark, keyVersion: this.crypto.activeKeyVersion };
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
    return `${encoded}.${this.crypto.fingerprint(['cursor', encoded], data.keyVersion)}`;
  }
  decode(value: string, actor: string, scope: string): CursorData {
    try {
      if (value.length > 2048) throw new Error();
      const [encoded, signature, ...rest] = value.split('.');
      if (!encoded || !signature || rest.length) throw new Error();
      const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      if (
        !isCursor(parsed) ||
        parsed.actor !== actor ||
        parsed.scope !== scope ||
        !this.crypto.matches(['cursor', encoded], signature, parsed.keyVersion)
      )
        throw new Error();
      return parsed;
    } catch {
      throw new ChatException(422, 'CHAT_CURSOR_INVALID');
    }
  }
}
function isCursor(x: unknown): x is CursorData {
  if (typeof x !== 'object' || x === null) return false;
  const v = x as Record<string, unknown>;
  return (
    typeof v.scope === 'string' &&
    typeof v.actor === 'string' &&
    typeof v.position === 'string' &&
    typeof v.watermark === 'string' &&
    Number.isSafeInteger(v.keyVersion)
  );
}
