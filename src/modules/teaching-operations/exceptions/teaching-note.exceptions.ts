import { AppHttpException } from '../../../common/http/app-http.exception.js';

export class TeachingNoteConflictException extends AppHttpException {
  constructor(
    code:
      | 'TEACHING_VERSION_CONFLICT'
      | 'TEACHING_NOTE_WINDOW_CLOSED'
      | 'TEACHING_NOTE_STATE_CONFLICT'
      | 'IDEMPOTENCY_KEY_REUSED',
  ) {
    super(409, code, 'Teaching note could not be saved; refresh the session and note');
  }
}
