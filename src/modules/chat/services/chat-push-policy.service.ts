import { Injectable, type OnModuleInit } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { PushEligibility } from '../../push-notifications/push-eligibility.service.js';
import { ChatException } from '../exceptions/chat.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatAccessService } from './chat-access.service.js';

@Injectable()
export class ChatPushPolicy implements OnModuleInit {
  constructor(
    private readonly scope: PushEligibility,
    private readonly access: ChatAccessService,
  ) {}
  onModuleInit(): void {
    this.scope.bind(async (m, actor, id) => {
      try {
        await this.access.authorize(m, actor, id);
        return true;
      } catch (e) {
        if (e instanceof ChatException) return false;
        throw e;
      }
    });
  }
}
