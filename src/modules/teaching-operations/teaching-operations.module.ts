import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { ScheduleReservationsModule } from '../schedule-reservations/schedule-reservations.module.js';
import { UsersModule } from '../users/users.module.js';
import { ManagementLeaveController } from './controllers/management-leave.controller.js';
import { MentorLeaveController } from './controllers/mentor-leave.controller.js';
import { LeavePlanningService } from './services/leave-planning.service.js';
import { MentorLeaveService } from './services/mentor-leave.service.js';

/** Owns leave requests/intervals/audits; Classes retains timetable ownership. */
@Module({
  imports: [AuthModule, ClassesModule, ScheduleReservationsModule, UsersModule],
  controllers: [MentorLeaveController, ManagementLeaveController],
  providers: [LeavePlanningService, MentorLeaveService],
})
export class TeachingOperationsModule {}
