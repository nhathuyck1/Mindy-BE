import { Injectable } from '@nestjs/common';
import { ChatException } from '../exceptions/chat.exceptions.js';

/** One-instance shared HTTP/WS budget; entries expire to avoid retaining every historic actor. */
@Injectable()
export class ChatRateService {
  private readonly sends = new Map<string, number[]>();
  private readonly typing = new Map<string, number>();
  send(userId: string): void {
    const now = Date.now();
    for (const [key, values] of this.sends)
      if ((values.at(-1) ?? 0) <= now - 60000) this.sends.delete(key);
    const values = (this.sends.get(userId) ?? []).filter((t) => t > now - 60000);
    const burst = values.filter((t) => t > now - 1000);
    if (values.length >= 20 || burst.length >= 5)
      throw new ChatException(429, 'CHAT_RATE_LIMITED', {
        retryAfterMs: Math.max(
          1,
          values.length >= 20 ? (values[0] ?? now) + 60000 - now : (burst[0] ?? now) + 1000 - now,
        ),
      });
    values.push(now);
    this.sends.set(userId, values);
  }
  type(userId: string, conversationId: string): void {
    const now = Date.now(),
      key = `${userId}/${conversationId}`,
      prior = this.typing.get(key) ?? 0;
    for (const [id, time] of this.typing) if (time <= now - 2000) this.typing.delete(id);
    if (prior > now - 2000)
      throw new ChatException(429, 'CHAT_RATE_LIMITED', { retryAfterMs: prior + 2000 - now });
    this.typing.set(key, now);
  }
}
