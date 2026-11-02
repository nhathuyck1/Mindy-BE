import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CodeSignatureDto } from './code.dto.js';

/** Student projections of CODE assignments: never include HIDDEN inputs/expected values or references. */

export class StudentCodeLanguageDto {
  @ApiProperty({ enum: ['javascript', 'java21'] }) readonly key!: string;
  @ApiProperty() readonly displayName!: string;
  @ApiProperty() readonly runtimeVersion!: string;
  @ApiProperty() readonly editorMode!: string;
  @ApiProperty() readonly starterCode!: string;
}

export class StudentCodeSampleDto {
  @ApiProperty() readonly position!: number;
  @ApiProperty({ type: 'array', items: {} }) readonly inputArgs!: unknown[];
  @ApiProperty() readonly expected!: unknown;
  @ApiProperty({ example: 'nums = [2,7,11,15], target = 9' }) readonly display!: string;
  @ApiProperty({ type: String, nullable: true }) readonly explanationMd!: string | null;
}

export class StudentCodeProblemDto {
  @ApiProperty() readonly statementMd!: string;
  @ApiProperty() readonly constraintsMd!: string;
  @ApiProperty({ type: String, nullable: true, enum: ['EASY', 'MEDIUM', 'HARD'] })
  readonly difficulty!: string | null;
  @ApiProperty({ type: CodeSignatureDto }) readonly signature!: CodeSignatureDto;
  @ApiProperty({ enum: ['EXACT', 'FLOAT', 'UNORDERED'] }) readonly compareMode!: string;
  @ApiProperty({ enum: ['PER_TEST', 'ALL_OR_NOTHING'] }) readonly scoringMode!: string;
  @ApiProperty() readonly cpuTimeLimitMs!: number;
  @ApiProperty() readonly memoryLimitMb!: number;
}

export class StudentCodeAssignmentDto {
  @ApiProperty({ format: 'uuid' }) readonly assignmentId!: string;
  @ApiProperty({ format: 'uuid' }) readonly sessionId!: string;
  @ApiProperty() readonly title!: string;
  @ApiProperty() readonly description!: string;
  @ApiProperty({ enum: ['TEST', 'HOMEWORK'] }) readonly purpose!: string;
  @ApiProperty({ enum: ['PUBLISHED', 'ARCHIVED'] }) readonly status!: string;
  @ApiProperty({ example: '10.00' }) readonly maxScore!: string;
  @ApiProperty({ type: String, format: 'date-time' }) readonly dueAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) readonly serverNow!: string;
  @ApiProperty() readonly deadlinePassed!: boolean;
  @ApiProperty() readonly maxAttempts!: number;
  @ApiProperty({
    description:
      'Includes queued, graded and mentor-voided submissions; excludes compile errors and system failures',
  })
  readonly attemptsUsed!: number;
  @ApiProperty() readonly attemptsRemaining!: number;
  @ApiProperty({ type: String, nullable: true, example: '7.50' }) readonly bestScore!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) readonly bestSubmissionId!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly inFlightSubmissionId!: string | null;
  @ApiProperty() readonly canSubmit!: boolean;
  @ApiProperty({ type: StudentCodeProblemDto }) readonly problem!: StudentCodeProblemDto;
  @ApiProperty({ type: [StudentCodeLanguageDto] })
  readonly languages!: readonly StudentCodeLanguageDto[];
  @ApiProperty({ type: [StudentCodeSampleDto] }) readonly samples!: readonly StudentCodeSampleDto[];
  @ApiProperty() readonly hiddenTestCount!: number;
}

export class CodeDraftDto {
  @ApiProperty({ enum: ['javascript', 'java21'] }) readonly languageKey!: string;
  @ApiProperty() readonly sourceCode!: string;
  @ApiProperty({ description: '0 = not saved yet (starter code returned)' })
  readonly version!: number;
  @ApiProperty({ type: String, nullable: true }) readonly updatedAt!: string | null;
}

export class CodeRunTestDto {
  @ApiProperty({ enum: ['SAMPLE', 'CUSTOM'] }) readonly kind!: string;
  @ApiProperty({ type: Number, nullable: true }) readonly position!: number | null;
  @ApiProperty() readonly display!: string;
  @ApiPropertyOptional({ description: 'SAMPLE only' }) readonly expected?: unknown;
  @ApiProperty({ nullable: true }) readonly actual!: unknown;
  @ApiProperty({
    enum: [
      'PASSED',
      'WRONG_ANSWER',
      'COMPLETED',
      'TIME_LIMIT',
      'MEMORY_LIMIT',
      'RUNTIME_ERROR',
      'OUTPUT_LIMIT',
    ],
  })
  readonly status!: string;
  @ApiProperty() readonly console!: string;
  @ApiProperty() readonly stderr!: string;
  @ApiProperty() readonly timeMs!: number;
  @ApiProperty() readonly memoryKb!: number;
}

export class CodeRunResultDto {
  @ApiProperty({ enum: ['OK', 'ERROR', 'TIMEOUT'] }) readonly compileStatus!: string;
  @ApiProperty() readonly compileOutput!: string;
  @ApiProperty() readonly runtimeVersion!: string;
  @ApiProperty({ type: [CodeRunTestDto] }) readonly tests!: readonly CodeRunTestDto[];
}

export class StudentCodeSubmissionTestDto {
  @ApiProperty() readonly position!: number;
  @ApiProperty({ enum: ['SAMPLE', 'HIDDEN'] }) readonly visibility!: string;
  @ApiProperty({
    enum: ['PASSED', 'WRONG_ANSWER', 'TIME_LIMIT', 'MEMORY_LIMIT', 'RUNTIME_ERROR', 'OUTPUT_LIMIT'],
  })
  readonly status!: string;
  @ApiProperty() readonly timeMs!: number;
  @ApiProperty() readonly memoryKb!: number;
  @ApiPropertyOptional({ type: 'array', items: {}, description: 'SAMPLE only' })
  readonly inputArgs?: unknown[];
  @ApiPropertyOptional({ description: 'SAMPLE only' }) readonly expected?: unknown;
  @ApiPropertyOptional({ description: 'SAMPLE only' }) readonly actual?: unknown;
  @ApiPropertyOptional({ description: 'SAMPLE only' }) readonly console?: string;
}

export class StudentCodeSubmissionDto {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ format: 'uuid' }) readonly assignmentId!: string;
  @ApiProperty() readonly attemptNumber!: number;
  @ApiProperty({ enum: ['javascript', 'java21'] }) readonly languageKey!: string;
  @ApiProperty({ type: String, nullable: true }) readonly runtimeVersion!: string | null;
  @ApiProperty({ enum: ['QUEUED', 'RUNNING', 'GRADED', 'FAILED', 'VOIDED'] })
  readonly status!: string;
  @ApiProperty({ type: String, nullable: true }) readonly verdict!: string | null;
  @ApiProperty() readonly countsAsAttempt!: boolean;
  @ApiProperty({ type: Number, nullable: true }) readonly passedCount!: number | null;
  @ApiProperty({ type: Number, nullable: true }) readonly totalCount!: number | null;
  @ApiProperty({ type: String, nullable: true }) readonly score!: string | null;
  @ApiProperty() readonly maxScore!: string;
  @ApiProperty({ type: String, nullable: true }) readonly compileOutput!: string | null;
  @ApiProperty({ type: Number, nullable: true }) readonly maxTimeMs!: number | null;
  @ApiProperty({ type: Number, nullable: true }) readonly maxMemoryKb!: number | null;
  @ApiProperty() readonly submittedAt!: string;
  @ApiProperty({ type: String, nullable: true }) readonly judgedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly voidedReason!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Poll hint while QUEUED/RUNNING' })
  readonly retryAfterMs!: number | null;
  @ApiPropertyOptional({ description: 'Detail only' }) readonly sourceCode?: string;
  @ApiPropertyOptional({
    type: [StudentCodeSubmissionTestDto],
    description: 'Detail only, after grading',
  })
  readonly tests?: readonly StudentCodeSubmissionTestDto[];
}

export class StudentCodeSubmissionListDto {
  @ApiProperty({ type: [StudentCodeSubmissionDto] })
  readonly items!: readonly StudentCodeSubmissionDto[];
}
