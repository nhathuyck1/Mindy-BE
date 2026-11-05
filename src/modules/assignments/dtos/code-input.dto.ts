import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import type { CodeCompareMode, CodeScoringMode } from '../domain/code-grading.js';
import {
  CODE_LANGUAGE_KEYS,
  CODE_VALUE_TYPES,
  type CodeLanguageKey,
  type CodeValueType,
} from '../domain/code-signature.js';
import { AssignmentRevisionInput } from './assignment-input.dto.js';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

export class CodeParamInput {
  @ApiProperty({ example: 'nums', pattern: IDENTIFIER.source })
  @IsString()
  @Matches(IDENTIFIER)
  readonly name!: string;

  @ApiProperty({ enum: CODE_VALUE_TYPES })
  @IsIn(CODE_VALUE_TYPES)
  readonly type!: CodeValueType;
}

export class CodeSignatureInput {
  @ApiProperty({ example: 'twoSum', pattern: IDENTIFIER.source })
  @IsString()
  @Matches(IDENTIFIER)
  readonly functionName!: string;

  @ApiProperty({ type: [CodeParamInput], minItems: 1, maxItems: 6 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => CodeParamInput)
  readonly params!: CodeParamInput[];

  @ApiProperty({ enum: CODE_VALUE_TYPES })
  @IsIn(CODE_VALUE_TYPES)
  readonly returnType!: CodeValueType;
}

export class CodeSignaturePreviewInput {
  @ApiProperty({ type: CodeSignatureInput })
  @ValidateNested()
  @Type(() => CodeSignatureInput)
  readonly signature!: CodeSignatureInput;
}

export class UpsertCodeProblemInput extends AssignmentRevisionInput {
  @ApiProperty({ maxLength: 50000, description: 'Markdown problem statement' })
  @IsString()
  @MaxLength(50000)
  readonly statementMd!: string;

  @ApiPropertyOptional({ maxLength: 5000, default: '' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(5000)
  readonly constraintsMd?: string;

  @ApiPropertyOptional({ enum: ['EASY', 'MEDIUM', 'HARD'], nullable: true })
  @IsOptional()
  @IsIn(['EASY', 'MEDIUM', 'HARD'])
  readonly difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | null;

  @ApiProperty({ type: CodeSignatureInput })
  @ValidateNested()
  @Type(() => CodeSignatureInput)
  readonly signature!: CodeSignatureInput;

  @ApiProperty({ enum: ['EXACT', 'FLOAT', 'UNORDERED'], default: 'EXACT' })
  @IsIn(['EXACT', 'FLOAT', 'UNORDERED'])
  readonly compareMode!: CodeCompareMode;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1e-10,
    maximum: 0.1,
    description: 'FLOAT only',
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1e-10)
  @Max(0.1)
  readonly floatEpsilon?: number | null;

  @ApiProperty({ enum: ['PER_TEST', 'ALL_OR_NOTHING'] })
  @IsIn(['PER_TEST', 'ALL_OR_NOTHING'])
  readonly scoringMode!: CodeScoringMode;

  @ApiProperty({ minimum: 100, maximum: 10000, default: 2000 })
  @IsInt()
  @Min(100)
  @Max(10000)
  readonly cpuTimeLimitMs!: number;

  @ApiProperty({ minimum: 64, maximum: 512, default: 256 })
  @IsInt()
  @Min(64)
  @Max(512)
  readonly memoryLimitMb!: number;
}

export class CodeLanguageInput {
  @ApiProperty({ enum: CODE_LANGUAGE_KEYS })
  @IsIn(CODE_LANGUAGE_KEYS)
  readonly languageKey!: CodeLanguageKey;

  @ApiPropertyOptional({ maxLength: 65536, description: 'Omit to generate from the signature' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(65536)
  readonly starterCode?: string;
}

export class ReplaceCodeLanguagesInput extends AssignmentRevisionInput {
  @ApiProperty({ type: [CodeLanguageInput], minItems: 1, maxItems: 2 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => CodeLanguageInput)
  readonly languages!: CodeLanguageInput[];
}

export class UpsertCodeTestInput extends AssignmentRevisionInput {
  @ApiProperty({ enum: ['SAMPLE', 'HIDDEN'] })
  @IsIn(['SAMPLE', 'HIDDEN'])
  readonly visibility!: 'SAMPLE' | 'HIDDEN';

  @ApiProperty({
    type: 'array',
    items: {},
    example: [[2, 7, 11, 15], 9],
    description: 'One JSON value per parameter',
  })
  @IsArray()
  @ArrayMaxSize(6)
  readonly inputArgs!: unknown[];

  @ApiProperty({ example: [0, 1], description: 'Expected JSON return value' })
  @IsDefined()
  readonly expected!: unknown;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 1 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly weight?: number;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true, description: 'SAMPLE only' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  readonly explanationMd?: string | null;
}

/** One row of the bulk test table (positions are assigned 1..n in array order). */
export class CodeTestItemInput {
  @ApiProperty({ enum: ['SAMPLE', 'HIDDEN'] })
  @IsIn(['SAMPLE', 'HIDDEN'])
  readonly visibility!: 'SAMPLE' | 'HIDDEN';

  @ApiProperty({ type: 'array', items: {}, example: [[2, 7, 11, 15], 9] })
  @IsArray()
  @ArrayMaxSize(6)
  readonly inputArgs!: unknown[];

  @ApiProperty({ example: [0, 1] })
  @IsDefined()
  readonly expected!: unknown;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 1 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly weight?: number;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true, description: 'SAMPLE only' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  readonly explanationMd?: string | null;
}

export class ReplaceCodeTestsInput extends AssignmentRevisionInput {
  @ApiProperty({ type: [CodeTestItemInput], minItems: 1, maxItems: 30 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CodeTestItemInput)
  readonly tests!: CodeTestItemInput[];
}

/** Runs the (unsaved) reference solution on inputs to produce expected outputs. Nothing is stored. */
export class GenerateCodeOutputsInput {
  @ApiProperty({ enum: CODE_LANGUAGE_KEYS })
  @IsIn(CODE_LANGUAGE_KEYS)
  readonly languageKey!: CodeLanguageKey;

  @ApiProperty({ maxLength: 65536 })
  @IsString()
  @MinLength(1)
  @MaxLength(65536)
  readonly sourceCode!: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: {} },
    minItems: 1,
    maxItems: 30,
    example: [[[2, 7, 11, 15], 9]],
    description: 'One inputArgs array per test',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsArray({ each: true })
  readonly inputs!: unknown[][];
}

export class ImportCodeProblemInput extends AssignmentRevisionInput {
  @ApiProperty({
    format: 'uuid',
    description: 'CODE assignment to copy problem, languages, tests and references from',
  })
  @IsUUID('4')
  readonly sourceAssignmentId!: string;
}

export class CodeLibraryQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'Search title or class code' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly q?: string;
}

export class UpsertCodeReferenceInput extends AssignmentRevisionInput {
  @ApiProperty({ maxLength: 65536 })
  @IsString()
  @MinLength(1)
  @MaxLength(65536)
  readonly sourceCode!: string;
}

export class ExtendCodeAssignmentInput extends AssignmentRevisionInput {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Only later than the current deadline',
  })
  @ValidateIf((_o, v) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  readonly dueAt?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, description: 'Only increases' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(50)
  readonly maxAttempts?: number;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  readonly reason!: string;
}

export class SaveCodeDraftInput {
  @ApiProperty({ maxLength: 65536 })
  @IsString()
  @MaxLength(65536)
  readonly sourceCode!: string;

  @ApiProperty({
    minimum: 0,
    description: '0 creates the first draft; otherwise the version last read',
  })
  @IsInt()
  @Min(0)
  readonly expectedVersion!: number;
}

export class CodeRunInput {
  @ApiProperty({ enum: CODE_LANGUAGE_KEYS })
  @IsIn(CODE_LANGUAGE_KEYS)
  readonly languageKey!: CodeLanguageKey;

  @ApiProperty({ maxLength: 65536 })
  @IsString()
  @MinLength(1)
  @MaxLength(65536)
  readonly sourceCode!: string;

  @ApiPropertyOptional({
    type: 'array',
    items: {},
    description: 'Custom arguments (one JSON value per parameter). Omit to run the sample tests.',
  })
  @ValidateIf((_o, v) => v !== undefined)
  @IsArray()
  @ArrayMaxSize(6)
  readonly customArgs?: unknown[];
}

export class CodeSubmitInput {
  @ApiProperty({ enum: CODE_LANGUAGE_KEYS })
  @IsIn(CODE_LANGUAGE_KEYS)
  readonly languageKey!: CodeLanguageKey;

  @ApiProperty({ maxLength: 65536 })
  @IsString()
  @MinLength(1)
  @MaxLength(65536)
  readonly sourceCode!: string;
}

export class CodeReviewQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Only this student' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID('4')
  readonly studentId?: string;
}

export class VoidCodeSubmissionInput {
  @ApiProperty({
    maxLength: 2000,
    description: 'Shown to the student; the submission still counts as an attempt',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  readonly reason!: string;
}
