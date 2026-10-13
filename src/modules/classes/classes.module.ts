import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminClassesController } from './controllers/admin-classes.controller.js';
import { ClassUnitReleaseController } from './controllers/class-unit-release.controller.js';
import { MentorContentContextController } from './controllers/mentor-content-context.controller.js';
import { StudentClassesController } from './controllers/student-classes.controller.js';
import { ClassEntity } from './entities/class.entity.js';
import { ClassSessionEntity } from './entities/class-session.entity.js';
import { ClassUnitEntity } from './entities/class-unit.entity.js';
import { ClassUnitReleaseAuditEntity } from './entities/class-unit-release-audit.entity.js';
import { ClassContentContextService } from './services/class-content-context.service.js';
import { ClassOffersService } from './services/class-offers.service.js';
import { ClassReadService } from './services/class-read.service.js';
import { ClassScheduleService } from './services/class-schedule.service.js';
import { ClassUnitReleaseService } from './services/class-unit-release.service.js';
import { ClassesService } from './services/classes.service.js';
import { MentorContentContextService } from './services/mentor-content-context.service.js';
import { StudentClassService } from './services/student-class.service.js';

/** Class management: the class aggregate (class, units, sessions) and its lifecycle. */
@Module({
  imports: [
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
    AdminClassesController,
    StudentClassesController,
    MentorContentContextController,
    ClassUnitReleaseController,
  ],
  providers: [
    ClassUnitReleaseService,
    ClassesService,
    ClassScheduleService,
    ClassReadService,
    ClassOffersService,
    ClassContentContextService,
    StudentClassService,
    MentorContentContextService,
  ],
  exports: [
    ClassReadService,
    ClassOffersService,
    ClassContentContextService,
    MentorContentContextService,
  ],
})
export class ClassesModule {}
