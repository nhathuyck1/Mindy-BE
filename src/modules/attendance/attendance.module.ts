import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { ScheduleReservationsModule } from '../schedule-reservations/schedule-reservations.module.js';
import { UsersModule } from '../users/users.module.js';
import { AttendanceController } from './controllers/attendance.controller.js';
import { AttendanceManagementController } from './controllers/attendance-management.controller.js';
import {
  ManagementAttendanceReportsController,
  StudentAttendanceReportsController,
} from './controllers/attendance-reports.controller.js';
import { MakeupManagementController } from './controllers/makeup-management.controller.js';
import { MentorAttendanceReportsController } from './controllers/mentor-attendance-reports.controller.js';
import { StudentMakeupController } from './controllers/student-makeup.controller.js';
import { AttendanceRecordEntity } from './entities/attendance-record.entity.js';
import { AttendanceRecoveryAuditEntity } from './entities/attendance-recovery-audit.entity.js';
import { AttendanceRecoveryAuditItemEntity } from './entities/attendance-recovery-audit-item.entity.js';
import { AttendanceService } from './services/attendance.service.js';
import { AttendanceAuditService } from './services/attendance-audit.service.js';
import { AttendanceProjectionService } from './services/attendance-projection.service.js';
import { AttendanceReportsService } from './services/attendance-reports.service.js';
import { GuestAttendanceService } from './services/guest-attendance.service.js';
import { MakeupPlacementService } from './services/makeup-placement.service.js';
import { MentorAttendanceReportsService } from './services/mentor-attendance-reports.service.js';

@Module({
  imports: [
    ScheduleReservationsModule,
    AuthModule,
    ClassesModule,
    EnrollmentsModule,
    UsersModule,
    PaymentsModule,
    TypeOrmModule.forFeature([
      AttendanceRecordEntity,
      AttendanceRecoveryAuditEntity,
      AttendanceRecoveryAuditItemEntity,
    ]),
  ],
  controllers: [
    MentorAttendanceReportsController,
    AttendanceController,
    AttendanceManagementController,
    MakeupManagementController,
    StudentMakeupController,
    StudentAttendanceReportsController,
    ManagementAttendanceReportsController,
  ],
  providers: [
    MentorAttendanceReportsService,
    AttendanceService,
    AttendanceAuditService,
    MakeupPlacementService,
    GuestAttendanceService,
    AttendanceProjectionService,
    AttendanceReportsService,
  ],
  exports: [AttendanceService, AttendanceProjectionService],
})
export class AttendanceModule {}
