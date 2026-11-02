import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { AssignmentRevisionInput } from './assignment-input.dto.js';

export class ZipVersionInput {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) readonly expectedVersion!: number;
}
export class ZipDraftInput {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) readonly expectedAssignmentRevision!: number;
}
export class AssignmentUploadInput extends ZipVersionInput {
  @ApiProperty({ maxLength: 250 })
  @IsString()
  @MaxLength(250)
  @Matches(/\S/)
  readonly originalFilename!: string;
  @ApiProperty() @IsString() @MaxLength(150) readonly declaredMimeType!: string;
  @ApiProperty({ minimum: 1, maximum: 26214400 })
  @IsInt()
  @Min(1)
  @Max(26214400)
  readonly declaredSizeBytes!: number;
}
export class InstructionUploadInput extends AssignmentRevisionInput {
  @ApiProperty({ maxLength: 250 })
  @IsString()
  @MaxLength(250)
  @Matches(/\S/)
  readonly originalFilename!: string;
  @ApiProperty() @IsString() @MaxLength(150) readonly declaredMimeType!: string;
  @ApiProperty({ minimum: 1, maximum: 26214400 })
  @IsInt()
  @Min(1)
  @Max(26214400)
  readonly declaredSizeBytes!: number;
}
export class InstructionFilesInput extends AssignmentRevisionInput {
  @ApiProperty({ type: [String], maxItems: 5 })
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  readonly fileIds!: string[];
}
export class ZipFileInput extends ZipVersionInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') readonly fileId!: string;
}
export class ExtendAssignmentInput extends AssignmentRevisionInput {
  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  readonly dueAt?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(10)
  readonly maxAttempts?: number;
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  @Matches(/\S/)
  readonly reason!: string;
}
export class ZipGradeInput {
  @ApiProperty({ minimum: 0, description: '0 when no grade exists' })
  @IsInt()
  @Min(0)
  readonly expectedVersion!: number;
  @ApiProperty({ example: '8.50' })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/)
  readonly score!: string;
  @ApiProperty({ maxLength: 10000 }) @IsString() @MaxLength(10000) readonly feedback!: string;
  @ApiPropertyOptional({ maxLength: 2000 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(2000)
  @Matches(/\S/)
  readonly reason?: string;
}
export class ZipReleaseInput extends ZipVersionInput {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) readonly gradeVersion!: number;
}
export class SubmissionQuery extends PageOptionsDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID('4')
  readonly studentId?: string;
  @ApiPropertyOptional({ enum: ['SUBMITTED', 'UNGRADED', 'GRADED', 'RELEASED', 'UNRELEASED'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['SUBMITTED', 'UNGRADED', 'GRADED', 'RELEASED', 'UNRELEASED'])
  readonly status?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(10)
  readonly attemptNumber?: number;
  @ApiPropertyOptional({ default: false })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['true', 'false'])
  readonly history?: string;
}
