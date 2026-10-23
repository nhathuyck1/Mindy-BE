import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
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
import type { OptionLabel } from '../domain/quiz.js';

export class CreateAssignmentInput {
  @ApiProperty({ enum: ['TEST', 'HOMEWORK'] })
  @IsIn(['TEST', 'HOMEWORK'])
  readonly purpose!: 'TEST' | 'HOMEWORK';

  @ApiProperty({ enum: ['QUIZ', 'ZIP'] })
  @IsIn(['QUIZ', 'ZIP'])
  readonly type!: 'QUIZ' | 'ZIP';

  @ApiProperty({ maxLength: 250 })
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  @Matches(/\S/)
  readonly title!: string;

  @ApiPropertyOptional({ maxLength: 20000, default: '' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(20000)
  readonly description?: string;

  @ApiProperty({ type: String, example: '100.00' })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/)
  readonly maxScore!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  readonly dueAt?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 240, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  readonly timeLimitMinutes?: number | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 1 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(10)
  readonly maxAttempts?: number;
}

export class AssignmentRevisionInput {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly expectedRevision!: number;
}
export class ArchiveAssignmentInput extends AssignmentRevisionInput {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  readonly reason!: string;
}
export class UpdateAssignmentInput extends AssignmentRevisionInput {
  @ApiPropertyOptional({ maxLength: 250 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  @Matches(/\S/)
  readonly title?: string;
  @ApiPropertyOptional({ maxLength: 20000 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(20000)
  readonly description?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  readonly dueAt?: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 240 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  readonly timeLimitMinutes?: number | null;
}
export class QuizOptionInput {
  @ApiProperty({ enum: ['A', 'B', 'C', 'D'] })
  @IsIn(['A', 'B', 'C', 'D'])
  readonly label!: OptionLabel;
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  readonly text!: string;
}
export class QuizQuestionInput {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID('4')
  readonly id?: string;
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  @Matches(/\S/)
  readonly prompt!: string;
  @ApiProperty({ type: [QuizOptionInput], minItems: 4, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => QuizOptionInput)
  readonly options!: QuizOptionInput[];
  @ApiProperty({ enum: ['A', 'B', 'C', 'D'] })
  @IsIn(['A', 'B', 'C', 'D'])
  readonly correctOption!: OptionLabel;
}
export class ReplaceQuestionsInput extends AssignmentRevisionInput {
  @ApiProperty({ type: [QuizQuestionInput], minItems: 1, maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionInput)
  readonly questions!: QuizQuestionInput[];
}
export class StartQuizInput {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly expectedAssignmentRevision!: number;
}
export class QuizAnswerInput {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  readonly questionId!: string;
  @ApiProperty({ enum: ['A', 'B', 'C', 'D'] })
  @IsIn(['A', 'B', 'C', 'D'])
  readonly selectedOption!: OptionLabel;
}
export class SaveAnswersInput {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly expectedVersion!: number;
  @ApiProperty({ type: [QuizAnswerInput], maxItems: 200 })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerInput)
  readonly answers!: QuizAnswerInput[];
}
export class AssignmentQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: ['QUIZ', 'ZIP'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['QUIZ', 'ZIP'])
  readonly type?: 'QUIZ' | 'ZIP';
  @ApiPropertyOptional({ enum: ['TEST', 'HOMEWORK'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['TEST', 'HOMEWORK'])
  readonly purpose?: 'TEST' | 'HOMEWORK';
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID('4')
  readonly sessionId?: string;
  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  readonly status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}
