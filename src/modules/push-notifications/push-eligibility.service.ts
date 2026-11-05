import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types.js';

export type PushScopeCheck = (
  manager: EntityManager,
  actor: AuthenticatedUser,
  conversationId: string,
) => Promise<boolean>;
/** Composition supplies the chat policy once; a missing policy always fails closed. */
@Injectable()
export class PushEligibility {
  private check: PushScopeCheck | undefined;
  bind(check: PushScopeCheck): void {
    if (this.check) throw new Error('Push eligibility already bound');
    this.check = check;
  }
  async allowed(
    manager: EntityManager,
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<boolean> {
    return this.check ? this.check(manager, actor, conversationId) : false;
  }
}
