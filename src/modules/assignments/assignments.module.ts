import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { UsersModule } from '../users/users.module.js';
import { MentorAssignmentsController } from './controllers/mentor-assignments.controller.js';
import { StudentAssignmentsController } from './controllers/student-assignments.controller.js';
import { AssignmentAccessService } from './services/assignment-access.service.js';
import { AssignmentsService } from './services/assignments.service.js';
import { QuizAttemptsService } from './services/quiz-attempts.service.js';
import { QuizTimeoutWorker } from './services/quiz-timeout.worker.js';

@Module({
  imports: [AuthModule, ClassesModule, EnrollmentsModule, UsersModule],
  controllers: [MentorAssignmentsController, StudentAssignmentsController],
  providers: [AssignmentAccessService, AssignmentsService, QuizAttemptsService, QuizTimeoutWorker],
})
export class AssignmentsModule {}
