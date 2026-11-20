import { Module } from '@nestjs/common';
import { AssignmentReportingService } from './services/assignment-reporting.service.js';
@Module({ providers: [AssignmentReportingService], exports: [AssignmentReportingService] })
export class AssignmentReportingModule {}
