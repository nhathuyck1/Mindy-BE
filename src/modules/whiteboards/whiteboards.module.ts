import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { FilesModule } from '../files/files.module.js';
import { UsersModule } from '../users/users.module.js';
import { BOARD_RENDERER, IsolatedBoardRenderer } from './board-renderer.service.js';
import { WhiteboardAccessService } from './whiteboard-access.service.js';
import { WhiteboardMediaController } from './whiteboard-media.controller.js';
import { WhiteboardMediaService } from './whiteboard-media.service.js';
import { WhiteboardMediaWorker } from './whiteboard-media.worker.js';
import { WhiteboardSocketService } from './whiteboard-socket.service.js';
import { SessionWhiteboardController, WhiteboardsController } from './whiteboards.controller.js';
import { WhiteboardsService } from './whiteboards.service.js';

@Module({
  imports: [AuthModule, ClassesModule, EnrollmentsModule, UsersModule, FilesModule],
  controllers: [SessionWhiteboardController, WhiteboardsController, WhiteboardMediaController],
  providers: [
    WhiteboardAccessService,
    WhiteboardsService,
    WhiteboardSocketService,
    WhiteboardMediaService,
    WhiteboardMediaWorker,
    IsolatedBoardRenderer,
    { provide: BOARD_RENDERER, useExisting: IsolatedBoardRenderer },
  ],
})
export class WhiteboardsModule {}
