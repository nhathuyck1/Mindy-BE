import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsUUID, Matches, ValidateIf } from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';

export class AttendanceRangeDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Paired range, at most 93 days',
  })
  @ValidateIf((o: AttendanceRangeDto) => o.from !== undefined || o.to !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly from?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((o: AttendanceRangeDto) => o.from !== undefined || o.to !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly to?: string;
}
export class AttendanceReportQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Paired range, at most 93 days',
  })
  @ValidateIf((o: AttendanceReportQueryDto) => o.from !== undefined || o.to !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly from?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((o: AttendanceReportQueryDto) => o.from !== undefined || o.to !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  readonly to?: string;
}
export const INCOMPLETE_ISSUES = ['OVERDUE_NOT_STARTED', 'STARTED_NOT_FINALIZED'] as const;
export type IncompleteIssue = (typeof INCOMPLETE_ISSUES)[number];
export class IncompleteSessionsQueryDto extends AttendanceReportQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsUUID('4')
  readonly classId?: string;

  @ApiPropertyOptional({ enum: INCOMPLETE_ISSUES })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsIn(INCOMPLETE_ISSUES)
  readonly issue?: IncompleteIssue;
}
