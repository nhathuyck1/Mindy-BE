import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { PasswordService } from '../../src/modules/auth/services/password.service.js';
import { SessionService } from '../../src/modules/auth/services/session.service.js';
import { TokenService } from '../../src/modules/auth/services/token.service.js';
import { ChatService } from '../../src/modules/chat/services/chat.service.js';
import { ChatAccessService } from '../../src/modules/chat/services/chat-access.service.js';
import { ChatAttachmentsService } from '../../src/modules/chat/services/chat-attachments.service.js';
import { ChatCryptoService } from '../../src/modules/chat/services/chat-crypto.service.js';
import { ChatCursorService } from '../../src/modules/chat/services/chat-cursor.service.js';
import { ChatEventService } from '../../src/modules/chat/services/chat-event.service.js';
import { ChatJobsService } from '../../src/modules/chat/services/chat-jobs.service.js';
import { ChatLifecycleService } from '../../src/modules/chat/services/chat-lifecycle.service.js';
import { ChatRateService } from '../../src/modules/chat/services/chat-rate.service.js';
import { ChatReceiptService } from '../../src/modules/chat/services/chat-receipt.service.js';
import { OrdersService } from '../../src/modules/commerce/services/orders.service.js';
import type { FileStorage } from '../../src/modules/files/files.contracts.js';
import { validateBinary } from '../../src/modules/files/validation/binary-validation.js';
import { paymentFixture } from './payment-fixture.js';

export function chatServices(db: DataSource, config: ConfigService, storage: FileStorage) {
  const f = paymentFixture(db),
    crypto = new ChatCryptoService(config),
    cursors = new ChatCursorService(crypto);
  const access = new ChatAccessService(
      config,
      f.read,
      f.enrollments,
      new OrdersService(db),
      f.users,
    ),
    jobs = new ChatJobsService(db);
  const passwords = new PasswordService(),
    tokens = new TokenService(config);
  const auth = new AuthService(
    db,
    config,
    f.users,
    passwords,
    tokens,
    new SessionService(config, passwords, tokens),
  );
  const attachments = new ChatAttachmentsService(
    db,
    config,
    access,
    jobs,
    storage,
    {
      validate: validateBinary,
    },
    new ChatReceiptService(crypto),
  );
  const chat = new ChatService(
    db,
    auth,
    access,
    crypto,
    new ChatReceiptService(crypto),
    new ChatEventService(),
    cursors,
    new ChatRateService(),
    f.users,
    f.read,
    attachments,
  );
  return {
    f,
    crypto,
    access,
    jobs,
    attachments,
    chat,
    lifecycle: new ChatLifecycleService(db, access, f.read, f.users, new ChatEventService()),
  };
}
