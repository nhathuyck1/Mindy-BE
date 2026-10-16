import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleReservationsModule } from '../schedule-reservations/schedule-reservations.module.js';
import { ClassUnitProgressEntity } from './entities/class-unit-progress.entity.js';
import { EnrollmentEntity } from './entities/enrollment.entity.js';
import { EnrollmentsService } from './services/enrollments.service.js';

@Module({
  imports: [
    ScheduleReservationsModule,
    TypeOrmModule.forFeature([EnrollmentEntity, ClassUnitProgressEntity]),
  ],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
