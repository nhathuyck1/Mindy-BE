import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { FilesModule } from '../files/files.module.js';
import { UsersModule } from '../users/users.module.js';
import { AssignmentReportingModule } from './assignment-reporting.module.js';
import { MentorAssignmentsController } from './controllers/mentor-assignments.controller.js';
import { MentorCodeAssignmentsController } from './controllers/mentor-code-assignments.controller.js';
import { StudentAssignmentsController } from './controllers/student-assignments.controller.js';
import { StudentCodeAssignmentsController } from './controllers/student-code-assignments.controller.js';
import {
  AssignmentFilesController,
  MentorZipAssignmentsController,
  StudentZipAssignmentsController,
} from './controllers/zip-assignments.controller.js';
import { AssignmentAccessService } from './services/assignment-access.service.js';
import { AssignmentFileValidator } from './services/assignment-file-validator.service.js';
import { AssignmentFilesService } from './services/assignment-files.service.js';
import { AssignmentFilesWorker } from './services/assignment-files.worker.js';
import { AssignmentHistoryService } from './services/assignment-history.service.js';
import { AssignmentsService } from './services/assignments.service.js';
import { CodeAuthoringService } from './services/code-authoring.service.js';
import { CODE_EXECUTOR, HttpCodeExecutor } from './services/code-executor.service.js';
import { CODE_SUBMISSION_NOTIFIER, CodeJudgeService } from './services/code-judge.service.js';
import { CodeJudgeWorker } from './services/code-judge.worker.js';
import { CodeReviewService } from './services/code-review.service.js';
import { ChatSocketCodeSubmissionNotifier } from './services/code-submission-notifier.js';
import { CodeSubmissionsService } from './services/code-submissions.service.js';
import { QuizAttemptsService } from './services/quiz-attempts.service.js';
import { QuizTimeoutWorker } from './services/quiz-timeout.worker.js';
import { ZipAccessService } from './services/zip-access.service.js';
import { ZipReceiptsService } from './services/zip-receipts.service.js';
import { ZipSubmissionsService } from './services/zip-submissions.service.js';

@Module({
  imports: [
    AuthModule,
    ChatModule,
    ClassesModule,
    EnrollmentsModule,
    UsersModule,
    FilesModule,
    AssignmentReportingModule,
  ],
  controllers: [
    MentorAssignmentsController,
    StudentAssignmentsController,
    AssignmentFilesController,
    MentorZipAssignmentsController,
    StudentZipAssignmentsController,
    MentorCodeAssignmentsController,
    StudentCodeAssignmentsController,
  ],
  providers: [
    AssignmentAccessService,
    AssignmentsService,
    QuizAttemptsService,
    QuizTimeoutWorker,
    ZipAccessService,
    ZipReceiptsService,
    ZipSubmissionsService,
    AssignmentFilesService,
    AssignmentFileValidator,
    AssignmentFilesWorker,
    AssignmentHistoryService,
    CodeAuthoringService,
    CodeSubmissionsService,
    CodeJudgeService,
    CodeJudgeWorker,
    CodeReviewService,
    { provide: CODE_EXECUTOR, useClass: HttpCodeExecutor },
    { provide: CODE_SUBMISSION_NOTIFIER, useClass: ChatSocketCodeSubmissionNotifier },
  ],
})
export class AssignmentsModule {}
