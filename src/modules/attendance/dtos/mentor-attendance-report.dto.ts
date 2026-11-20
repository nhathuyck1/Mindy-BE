import { ApiProperty } from '@nestjs/swagger';
import {
  AttendanceHistoryPageDto,
  AttendanceSummaryDto,
  ClassAttendanceSummaryPageDto,
} from './attendance-report.dto.js';
export class MentorAttendanceHistoryPageDto extends AttendanceHistoryPageDto {
  @ApiProperty({ description: 'Class completed or cancelled; historical report is read only' })
  readonly readonly!: boolean;
}
export class MentorAttendanceSummaryDto extends AttendanceSummaryDto {
  @ApiProperty() readonly readonly!: boolean;
  @ApiProperty({
    enum: ['STUDENT_CLASS_HISTORY'],
    description:
      'Shared credit formula covers the student class history; use class summary for per-enrollment rows',
  })
  readonly aggregationScope!: 'STUDENT_CLASS_HISTORY';
}
export class MentorClassAttendanceSummaryPageDto extends ClassAttendanceSummaryPageDto {
  @ApiProperty() readonly readonly!: boolean;
}
