import { Module } from '@nestjs/common';
import { ScheduleReservationsService } from './schedule-reservations.service.js';

/** Low-level read/lock projection: no Classes/Attendance/Payments dependency or entity ownership. */
@Module({ providers: [ScheduleReservationsService], exports: [ScheduleReservationsService] })
export class ScheduleReservationsModule {}
