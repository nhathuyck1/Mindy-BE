import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { MentorAvailabilityService } from '../mentor-availability/mentor-availability.service.js';
import { ScheduleReservationsModule } from '../schedule-reservations/schedule-reservations.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminClassesController } from './controllers/admin-classes.controller.js';
import { MentorContentContextController } from './controllers/mentor-content-context.controller.js';
import { MentorScheduleController } from './controllers/mentor-schedule.controller.js';
import { MentorSessionMeetingController } from './controllers/mentor-session-meeting.controller.js';
import { MentorWorkspaceController } from './controllers/mentor-workspace.controller.js';
import { SessionContextController } from './controllers/session-context.controller.js';
import { SessionOperationsController } from './controllers/session-operations.controller.js';
import { StudentClassesController } from './controllers/student-classes.controller.js';
import { TeachingManagementController } from './controllers/teaching-management.controller.js';
import { ClassEntity } from './entities/class.entity.js';
import { ClassSessionEntity } from './entities/class-session.entity.js';
import { ClassUnitEntity } from './entities/class-unit.entity.js';
import { ClassUnitReleaseAuditEntity } from './entities/class-unit-release-audit.entity.js';
import { ClassContentContextService } from './services/class-content-context.service.js';
import { ClassOffersService } from './services/class-offers.service.js';
import { ClassReadService } from './services/class-read.service.js';
import { ClassScheduleService } from './services/class-schedule.service.js';
import { ClassesService } from './services/classes.service.js';
import { MentorConflictService } from './services/mentor-conflict.service.js';
import { MentorContentContextService } from './services/mentor-content-context.service.js';
import { MentorProgressService } from './services/mentor-progress.service.js';
import { MentorWorkspaceService } from './services/mentor-workspace.service.js';
import { SessionLifecycleService } from './services/session-lifecycle.service.js';
import { SessionMeetingService } from './services/session-meeting.service.js';
import { SessionOperationsService } from './services/session-operations.service.js';
import { StudentClassService } from './services/student-class.service.js';
import { TeachingAssignmentService } from './services/teaching-assignment.service.js';
import { TeachingReadService } from './services/teaching-read.service.js';
import { UnitContentService } from './services/unit-content.service.js';

/** Class management: the class aggregate (class, units, sessions) and its lifecycle. */
@Module({
  imports: [
    ScheduleReservationsModule,
    ConfigModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    EnrollmentsModule,
    TypeOrmModule.forFeature([
      ClassEntity,
      ClassUnitEntity,
      ClassSessionEntity,
      ClassUnitReleaseAuditEntity,
    ]),
  ],
  controllers: [
    MentorSessionMeetingController,
    MentorWorkspaceController,
    AdminClassesController,
    StudentClassesController,
    MentorContentContextController,
    TeachingManagementController,
    MentorScheduleController,
    SessionContextController,
    SessionOperationsController,
  ],
  providers: [
    SessionMeetingService,
    MentorProgressService,
    MentorWorkspaceService,
    MentorAvailabilityService,
    UnitContentService,
    SessionLifecycleService,
    SessionOperationsService,
    TeachingReadService,
    TeachingAssignmentService,
    MentorConflictService,
    ClassesService,
    ClassScheduleService,
    ClassReadService,
    ClassOffersService,
    ClassContentContextService,
    StudentClassService,
    MentorContentContextService,
  ],
  exports: [
    MentorWorkspaceService,
    ClassScheduleService,
    SessionLifecycleService,
    TeachingReadService,
    MentorConflictService,
    ClassReadService,
    ClassOffersService,
    ClassContentContextService,
    MentorContentContextService,
  ],
})
export class ClassesModule {}
