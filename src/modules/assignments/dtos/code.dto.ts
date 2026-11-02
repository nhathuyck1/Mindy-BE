import { ApiProperty } from '@nestjs/swagger';
import type {
  CodeLanguageRow,
  CodeProblemLanguageRow,
  CodeProblemRow,
  CodeReferenceRow,
  CodeTestRow,
} from '../assignment.types.js';
import type { CodeReadinessBlocker } from '../domain/code-readiness.js';
import { CODE_VALUE_TYPES, type CodeSignature } from '../domain/code-signature.js';
import { AssignmentDto } from './assignment.dto.js';

export class CodeLanguageDto {
  @ApiProperty({ enum: ['javascript', 'java21'] }) readonly key: string;
  @ApiProperty() readonly displayName: string;
  @ApiProperty() readonly runtimeVersion: string;
  @ApiProperty({ description: 'Editor (Monaco/re_editor) language id' })
  readonly editorMode: string;
  constructor(row: CodeLanguageRow) {
    this.key = row.key;
    this.displayName = row.display_name;
    this.runtimeVersion = row.runtime_version;
    this.editorMode = row.editor_mode;
  }
}

export class CodeParamDto {
  @ApiProperty() readonly name!: string;
  @ApiProperty({ enum: CODE_VALUE_TYPES }) readonly type!: string;
}
export class CodeSignatureDto {
  @ApiProperty() readonly functionName!: string;
  @ApiProperty({ type: [CodeParamDto] }) readonly params!: readonly CodeParamDto[];
  @ApiProperty({ enum: CODE_VALUE_TYPES }) readonly returnType!: string;
}

export class CodeProblemDto {
  @ApiProperty() readonly statementMd: string;
  @ApiProperty() readonly constraintsMd: string;
  @ApiProperty({ type: String, enum: ['EASY', 'MEDIUM', 'HARD'], nullable: true })
  readonly difficulty: string | null;
  @ApiProperty({ type: CodeSignatureDto }) readonly signature: CodeSignature;
  @ApiProperty({ enum: ['EXACT', 'FLOAT', 'UNORDERED'] }) readonly compareMode: string;
  @ApiProperty({ type: Number, nullable: true }) readonly floatEpsilon: number | null;
  @ApiProperty({ enum: ['PER_TEST', 'ALL_OR_NOTHING'] }) readonly scoringMode: string;
  @ApiProperty() readonly cpuTimeLimitMs: number;
  @ApiProperty() readonly memoryLimitMb: number;
  constructor(row: CodeProblemRow, signature: CodeSignature) {
    this.statementMd = row.statement_md;
    this.constraintsMd = row.constraints_md;
    this.difficulty = row.difficulty;
    this.signature = signature;
    this.compareMode = row.compare_mode;
    this.floatEpsilon = row.float_epsilon === null ? null : Number(row.float_epsilon);
    this.scoringMode = row.scoring_mode;
    this.cpuTimeLimitMs = row.cpu_time_limit_ms;
    this.memoryLimitMb = row.memory_limit_mb;
  }
}

export class CodeProblemLanguageDto {
  @ApiProperty({ enum: ['javascript', 'java21'] }) readonly languageKey: string;
  @ApiProperty() readonly starterCode: string;
  constructor(row: CodeProblemLanguageRow) {
    this.languageKey = row.language_key;
    this.starterCode = row.starter_code;
  }
}

/** Mentor-only: includes hidden inputs and expected values. */
export class MentorCodeTestDto {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty() readonly position: number;
  @ApiProperty({ enum: ['SAMPLE', 'HIDDEN'] }) readonly visibility: string;
  @ApiProperty({ type: 'array', items: {} }) readonly inputArgs: unknown[];
  @ApiProperty() readonly expected: unknown;
  @ApiProperty() readonly weight: number;
  @ApiProperty({ type: String, nullable: true }) readonly explanationMd: string | null;
  constructor(row: CodeTestRow) {
    this.id = row.id;
    this.position = row.position;
    this.visibility = row.visibility;
    this.inputArgs = row.input_args;
    this.expected = row.expected;
    this.weight = row.weight;
    this.explanationMd = row.explanation_md;
  }
}

export class CodeValidationTestDto {
  @ApiProperty() readonly position!: number;
  @ApiProperty({ enum: ['SAMPLE', 'HIDDEN'] }) readonly visibility!: string;
  @ApiProperty({
    enum: ['PASSED', 'WRONG_ANSWER', 'TIME_LIMIT', 'MEMORY_LIMIT', 'RUNTIME_ERROR', 'OUTPUT_LIMIT'],
  })
  readonly verdict!: string;
  @ApiProperty() readonly actual!: unknown;
  @ApiProperty() readonly timeMs!: number;
  @ApiProperty() readonly memoryKb!: number;
  @ApiProperty() readonly stderr!: string;
}
export class CodeValidationDto {
  @ApiProperty({ enum: ['javascript', 'java21'] }) readonly languageKey!: string;
  @ApiProperty({ enum: ['OK', 'ERROR', 'TIMEOUT', 'SKIPPED'] }) readonly compileStatus!: string;
  @ApiProperty() readonly compileOutput!: string;
  @ApiProperty() readonly passed!: number;
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly runtimeVersion!: string;
  @ApiProperty({ type: [CodeValidationTestDto] }) readonly tests!: readonly CodeValidationTestDto[];
}

export class CodeReferenceDto {
  @ApiProperty({ enum: ['javascript', 'java21'] }) readonly languageKey: string;
  @ApiProperty() readonly sourceCode: string;
  @ApiProperty({ type: String, nullable: true }) readonly validatedAt: string | null;
  @ApiProperty({ type: CodeValidationDto, nullable: true }) readonly lastValidation: unknown;
  constructor(row: CodeReferenceRow) {
    this.languageKey = row.language_key;
    this.sourceCode = row.source_code;
    this.validatedAt = row.validated_at?.toISOString() ?? null;
    this.lastValidation = row.last_validation ?? null;
  }
}

export class MentorCodeAuthoringDto {
  @ApiProperty({ type: AssignmentDto }) readonly assignment!: AssignmentDto;
  @ApiProperty({ type: CodeProblemDto, nullable: true }) readonly problem!: CodeProblemDto | null;
  @ApiProperty({ type: [CodeProblemLanguageDto] })
  readonly languages!: readonly CodeProblemLanguageDto[];
  @ApiProperty({ type: [MentorCodeTestDto] }) readonly tests!: readonly MentorCodeTestDto[];
  @ApiProperty({ type: [CodeReferenceDto] }) readonly references!: readonly CodeReferenceDto[];
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Revision whose reference validation passed',
  })
  readonly validatedRevision!: number | null;
  @ApiProperty({ type: [String], description: 'Empty when the draft can be published' })
  readonly publishBlockers!: readonly CodeReadinessBlocker[];
  @ApiProperty({ type: [CodeLanguageDto] })
  readonly availableLanguages!: readonly CodeLanguageDto[];
}

export class CodeValidationResultDto {
  @ApiProperty() readonly validated!: boolean;
  @ApiProperty() readonly revision!: number;
  @ApiProperty({ type: [CodeValidationDto] }) readonly results!: readonly CodeValidationDto[];
}

export class CodeStarterPreviewDto {
  @ApiProperty() readonly javascript!: string;
  @ApiProperty() readonly java21!: string;
}

export class CodeGeneratedOutputDto {
  @ApiProperty() readonly index!: number;
  @ApiProperty({
    enum: [
      'OK',
      'TIME_LIMIT',
      'MEMORY_LIMIT',
      'RUNTIME_ERROR',
      'OUTPUT_LIMIT',
      'NO_RESULT',
      'INVALID_RETURN',
    ],
    description:
      'OK = expected is the reference return value; anything else must be fixed before saving',
  })
  readonly status!: string;
  @ApiProperty({ nullable: true, description: 'Reference return value (only when status = OK)' })
  readonly expected!: unknown;
  @ApiProperty() readonly console!: string;
  @ApiProperty() readonly stderr!: string;
  @ApiProperty() readonly timeMs!: number;
  @ApiProperty() readonly memoryKb!: number;
}

export class CodeGenerateResultDto {
  @ApiProperty({ enum: ['javascript', 'java21'] }) readonly languageKey!: string;
  @ApiProperty({ enum: ['OK', 'ERROR', 'TIMEOUT'] }) readonly compileStatus!: string;
  @ApiProperty() readonly compileOutput!: string;
  @ApiProperty() readonly runtimeVersion!: string;
  @ApiProperty({ type: [CodeGeneratedOutputDto] }) readonly outputs!: CodeGeneratedOutputDto[];
}

export class CodeLibraryItemDto {
  @ApiProperty() readonly assignmentId!: string;
  @ApiProperty() readonly title!: string;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] }) readonly status!: string;
  @ApiProperty() readonly classCode!: string;
  @ApiProperty() readonly className!: string;
  @ApiProperty() readonly sessionNumber!: number;
  @ApiProperty() readonly sessionTitle!: string;
  @ApiProperty() readonly testCount!: number;
  @ApiProperty({ type: [String] }) readonly languages!: string[];
  @ApiProperty({ type: String, enum: ['EASY', 'MEDIUM', 'HARD'], nullable: true })
  readonly difficulty!: string | null;
  @ApiProperty() readonly updatedAt!: string;
}

export class CodeLibraryPageDto {
  @ApiProperty({ type: [CodeLibraryItemDto] }) readonly items!: CodeLibraryItemDto[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
}
