import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EnrollmentEntity } from './entities/enrollment.entity.js';
import { EnrollmentsService } from './services/enrollments.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([EnrollmentEntity])],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
