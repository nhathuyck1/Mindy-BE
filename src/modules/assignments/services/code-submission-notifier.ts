import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ChatSocketService } from '../../chat/services/chat-socket.service.js';
import type { CodeSubmissionNotifier } from './code-judge.service.js';

/**
 * Pushes `code_submission.updated` to the student's authenticated Socket.IO connections (Phase 6 transport,
 * active only when CHAT_ENABLED). Payload: ids and status only; clients refetch the submission detail.
 */
@Injectable()
export class ChatSocketCodeSubmissionNotifier implements CodeSubmissionNotifier {
  constructor(private readonly sockets: ChatSocketService) {}

  async submissionUpdated(
    studentId: string,
    event: { submissionId: string; assignmentId: string; status: string },
  ): Promise<void> {
    await this.sockets.own(studentId, 'code_submission.updated', event);
  }
}
