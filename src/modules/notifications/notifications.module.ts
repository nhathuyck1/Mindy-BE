import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { MaterialsModule } from '../materials/materials.module.js';
import { NotificationInboxController } from './controllers/notification-inbox.controller.js';
import { NotificationCursorService } from './services/notification-cursor.service.js';
import { NotificationInboxService } from './services/notification-inbox.service.js';
import { NotificationPolicyService } from './services/notification-policy.service.js';
import { NotificationRemindersService } from './services/notification-reminders.service.js';
import { NotificationSocketService } from './services/notification-socket.service.js';
import { NotificationWorkerService } from './services/notification-worker.service.js';

@Module({
  imports: [AuthModule, ChatModule, MaterialsModule],
  controllers: [NotificationInboxController],
  providers: [
    NotificationCursorService,
    NotificationInboxService,
    NotificationPolicyService,
    NotificationSocketService,
    NotificationRemindersService,
    NotificationWorkerService,
  ],
})
export class NotificationsModule {}
