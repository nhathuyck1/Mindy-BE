import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StudentCodeSubmissionDto } from './code-student.dto.js';

/** Mentor projections of CODE submissions (Phase 7 C4). Mentors may see hidden inputs and expected values. */

export class CodeSummaryRowDto {
  @ApiProperty({ format: 'uuid' }) readonly studentId!: string;
  @ApiProperty() readonly displayName!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Current enrollment status in the class',
  })
  readonly enrollmentStatus!: string | null;
  @ApiProperty() readonly submissionCount!: number;
  @ApiProperty({
    description: 'Same rule as the student view (voided counted; compile/system errors not)',
  })
  readonly attemptsUsed!: number;
  @ApiProperty({ type: String, nullable: true }) readonly bestScore!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly bestSubmissionId!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly latestStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly latestVerdict!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly latestSubmittedAt!: string | null;
  @ApiProperty() readonly failedCount!: number;
}

export class CodeSummaryTotalsDto {
  @ApiProperty({ description: 'Students with an ACTIVE enrollment or at least one submission' })
  readonly students!: number;
  @ApiProperty() readonly submitted!: number;
  @ApiProperty() readonly notSubmitted!: number;
  @ApiProperty({ description: 'Best verdict ACCEPTED' }) readonly accepted!: number;
  @ApiProperty({ description: 'Submissions waiting for a mentor rejudge' })
  readonly failed!: number;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Average best score of students who have one',
  })
  readonly averageBestScore!: string | null;
}

export class CodeSummaryDto {
  @ApiProperty({ format: 'uuid' }) readonly assignmentId!: string;
  @ApiProperty() readonly maxScore!: string;
  @ApiProperty() readonly maxAttempts!: number;
  @ApiProperty({ type: String, nullable: true }) readonly dueAt!: string | null;
  @ApiProperty({ type: CodeSummaryTotalsDto }) readonly totals!: CodeSummaryTotalsDto;
  @ApiProperty({ type: [CodeSummaryRowDto] }) readonly items!: readonly CodeSummaryRowDto[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
}

export class MentorCodeSubmissionDto extends StudentCodeSubmissionDto {
  @ApiProperty({ format: 'uuid' }) readonly studentId!: string;
  @ApiProperty() readonly displayName!: string;
  @ApiProperty({
    description: 'Identical code in another submission of this assignment (other student)',
  })
  readonly duplicateOfOtherStudent!: boolean;
}

export class MentorCodeSubmissionTestDto {
  @ApiProperty() readonly position!: number;
  @ApiProperty({ enum: ['SAMPLE', 'HIDDEN'] }) readonly visibility!: string;
  @ApiProperty() readonly weight!: number;
  @ApiProperty() readonly status!: string;
  @ApiProperty() readonly timeMs!: number;
  @ApiProperty() readonly memoryKb!: number;
  @ApiProperty({ type: 'array', items: {} }) readonly inputArgs!: unknown[];
  @ApiProperty() readonly expected!: unknown;
  @ApiPropertyOptional({ description: 'SAMPLE only (hidden outputs are never stored)' })
  readonly actual?: unknown;
  @ApiPropertyOptional({ description: 'SAMPLE only' }) readonly console?: string;
}

export class MentorCodeSubmissionDetailDto extends MentorCodeSubmissionDto {
  @ApiProperty({ type: [MentorCodeSubmissionTestDto] })
  readonly mentorTests!: readonly MentorCodeSubmissionTestDto[];
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Last infrastructure error (FAILED only)',
  })
  readonly lastError!: string | null;
}

export class MentorCodeSubmissionPageDto {
  @ApiProperty({ type: [MentorCodeSubmissionDto] })
  readonly items!: readonly MentorCodeSubmissionDto[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
}
