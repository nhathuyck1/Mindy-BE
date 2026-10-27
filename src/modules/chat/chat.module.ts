import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { CommerceModule } from '../commerce/commerce.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { FilesModule } from '../files/files.module.js';
import { UsersModule } from '../users/users.module.js';
import { ChatController, ClassChatController } from './controllers/chat.controller.js';
import { ChatAttachmentsController } from './controllers/chat-attachments.controller.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { ChatService } from './services/chat.service.js';
import { ChatAccessService } from './services/chat-access.service.js';
import { ChatAttachmentsService } from './services/chat-attachments.service.js';
import { ChatCryptoService } from './services/chat-crypto.service.js';
import { ChatCursorService } from './services/chat-cursor.service.js';
import { ChatEventService } from './services/chat-event.service.js';
import { ChatJobsService } from './services/chat-jobs.service.js';
import { ChatLifecycleService } from './services/chat-lifecycle.service.js';
import { ChatNotificationsService } from './services/chat-notifications.service.js';
import { ChatRateService } from './services/chat-rate.service.js';
import { ChatReceiptService } from './services/chat-receipt.service.js';
import { ChatSocketService } from './services/chat-socket.service.js';
import { ChatWorkerService } from './services/chat-worker.service.js';

@Module({
  imports: [AuthModule, ClassesModule, CommerceModule, EnrollmentsModule, UsersModule, FilesModule],
  controllers: [
    ChatController,
    ClassChatController,
    NotificationsController,
    ChatAttachmentsController,
  ],
  providers: [
    ChatAttachmentsService,
    ChatNotificationsService,
    ChatSocketService,
    ChatWorkerService,
    ChatService,
    ChatLifecycleService,
    ChatCursorService,
    ChatRateService,
    ChatAccessService,
    ChatCryptoService,
    ChatEventService,
    ChatJobsService,
    ChatReceiptService,
  ],
  exports: [ChatLifecycleService, ChatCryptoService],
})
export class ChatModule {}
