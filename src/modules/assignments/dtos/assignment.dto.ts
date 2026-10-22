import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import type { AssignmentRow, SubmissionRow } from '../assignment.types.js';
import type { OptionLabel, QuizAnswer, QuizQuestion, QuizResult } from '../domain/quiz.js';

export class QuizOptionDto {
  @ApiProperty({ enum: ['A', 'B', 'C', 'D'] }) readonly label!: OptionLabel;
  @ApiProperty() readonly text!: string;
}
export class QuizQuestionDto implements QuizQuestion {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly position!: number;
  @ApiProperty() readonly prompt!: string;
  @ApiProperty({ type: [QuizOptionDto] }) readonly options!: readonly QuizOptionDto[];
}
export class MentorQuizQuestionDto extends QuizQuestionDto {
  @ApiProperty({ enum: ['A', 'B', 'C', 'D'] }) readonly correctOption!: OptionLabel;
}
export class QuizAnswerDto implements QuizAnswer {
  @ApiProperty({ format: 'uuid' }) readonly questionId!: string;
  @ApiProperty({ enum: ['A', 'B', 'C', 'D'] }) readonly selectedOption!: OptionLabel;
}
export class QuizQuestionResultDto {
  @ApiProperty({ format: 'uuid' }) readonly questionId!: string;
  @ApiProperty({ type: String, enum: ['A', 'B', 'C', 'D'], nullable: true })
  readonly selectedOption!: OptionLabel | null;
  @ApiProperty({ enum: ['A', 'B', 'C', 'D'] }) readonly correctOption!: OptionLabel;
  @ApiProperty() readonly isCorrect!: boolean;
}
export class QuizResultDto implements QuizResult {
  @ApiProperty() readonly totalQuestions!: number;
  @ApiProperty() readonly answeredCount!: number;
  @ApiProperty() readonly correctCount!: number;
  @ApiProperty() readonly wrongCount!: number;
  @ApiProperty({ example: '82.50' }) readonly score!: string;
  @ApiProperty({ example: '100.00' }) readonly maxScore!: string;
  @ApiProperty({ type: [QuizQuestionResultDto] })
  readonly results!: readonly QuizQuestionResultDto[];
}

export class AssignmentDto {
  @ApiProperty() readonly id: string;
  @ApiProperty() readonly sessionId: string;
  @ApiProperty({ enum: ['TEST', 'HOMEWORK'] }) readonly purpose: string;
  @ApiProperty({ enum: ['QUIZ', 'ZIP'] }) readonly type: string;
  @ApiProperty() readonly title: string;
  @ApiProperty() readonly description: string;
  @ApiProperty() readonly maxScore: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readonly dueAt: string | null;
  @ApiProperty({ type: Number, nullable: true }) readonly timeLimitMinutes: number | null;
  @ApiProperty() readonly maxAttempts: number;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] }) readonly status: string;
  @ApiProperty() readonly revision: number;
  @ApiProperty({ type: String, nullable: true }) readonly publishedAt: string | null;
  @ApiPropertyOptional({
    type: [MentorQuizQuestionDto],
    description: 'Mentor detail only; includes correctOption. Absent from student metadata.',
  })
  readonly questions?: readonly (QuizQuestion & { readonly correctOption: OptionLabel })[];

  constructor(
    row: AssignmentRow,
    questions?: readonly (QuizQuestion & { correctOption: OptionLabel })[],
  ) {
    this.id = row.id;
    this.sessionId = row.session_id;
    this.purpose = row.purpose;
    this.type = row.type;
    this.title = row.title;
    this.description = row.description;
    this.maxScore = row.max_score;
    this.dueAt = row.due_at?.toISOString() ?? null;
    this.timeLimitMinutes = row.time_limit_minutes;
    this.maxAttempts = row.max_attempts;
    this.status = row.status;
    this.revision = row.revision;
    this.publishedAt = row.published_at?.toISOString() ?? null;
    if (questions !== undefined) this.questions = questions;
  }
}
/** Student OpenAPI projection never advertises the private authoring key fields. */
export class StudentAssignmentDto extends OmitType(AssignmentDto, ['questions'] as const) {}
export class AssignmentPageDto {
  @ApiProperty({ type: [AssignmentDto] }) readonly items!: AssignmentDto[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
}
export class StudentAssignmentPageDto {
  @ApiProperty({ type: [StudentAssignmentDto] }) readonly items!: StudentAssignmentDto[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
}
export class QuizAttemptDto {
  @ApiProperty() readonly attemptId: string;
  @ApiProperty() readonly assignmentId: string;
  @ApiProperty({ enum: ['IN_PROGRESS', 'FINALIZING', 'GRADED', 'VOIDED'] }) readonly status: string;
  @ApiProperty() readonly version: number;
  @ApiProperty() readonly startedAt: string;
  @ApiProperty({ type: String, nullable: true }) readonly expiresAt: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly submittedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly submissionSource: string | null;
  @ApiProperty() readonly serverNow: string;
  @ApiProperty() readonly totalQuestions: number;
  @ApiProperty() readonly answeredCount: number;
  @ApiProperty({ type: [QuizQuestionDto] })
  readonly questions: readonly QuizQuestion[];
  @ApiProperty({ type: [QuizAnswerDto] })
  readonly answers: readonly QuizAnswer[];
  @ApiProperty({ type: QuizResultDto, nullable: true })
  readonly result: QuizResult | null;
  @ApiProperty({ type: Number, nullable: true }) readonly retryAfterSeconds: number | null;

  constructor(row: SubmissionRow, now: Date, result = false) {
    this.attemptId = row.id;
    this.assignmentId = row.assignment_id;
    this.status =
      row.status === 'IN_PROGRESS' && row.expires_at && now >= row.expires_at
        ? 'FINALIZING'
        : row.status;
    this.version = row.version;
    this.startedAt = row.started_at.toISOString();
    this.expiresAt = row.expires_at?.toISOString() ?? null;
    this.submittedAt = row.submitted_at?.toISOString() ?? null;
    this.submissionSource = row.submission_source;
    this.serverNow = now.toISOString();
    this.totalQuestions = row.assignment_snapshot.questions.length;
    this.answeredCount = row.answers.length;
    this.questions = row.status === 'VOIDED' ? [] : row.assignment_snapshot.questions;
    this.answers = row.status === 'VOIDED' ? [] : row.answers;
    this.result = result && row.status === 'GRADED' ? row.result : null;
    this.retryAfterSeconds = this.status === 'FINALIZING' ? 2 : null;
  }
}
