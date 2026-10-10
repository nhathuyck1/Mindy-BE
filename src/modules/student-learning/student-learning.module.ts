import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module.js';
import { MyClassesController } from './controllers/my-classes.controller.js';
import { MyScheduleController } from './controllers/my-schedule.controller.js';
import { MyClassesService } from './services/my-classes.service.js';
import { MyScheduleService } from './services/my-schedule.service.js';

/**
 * Student-facing read projections after registration: My Classes and the personal schedule.
 * Owns no entity and performs no writes; access rules mirror the class detail and CASH preview
 * endpoints, which stay in the classes and payments modules. No module imports this one.
 */
@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [MyClassesController, MyScheduleController],
  providers: [MyClassesService, MyScheduleService],
})
export class StudentLearningModule {}
