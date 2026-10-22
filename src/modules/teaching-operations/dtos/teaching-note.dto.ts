import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class TeachingNoteInput {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) @Max(2147483646) readonly expectedVersion!: number;
  @ApiProperty({ maxLength: 10000 }) @IsString() @Length(0, 10000) readonly content!: string;
  @ApiProperty({ maxLength: 5000 }) @IsString() @Length(0, 5000) readonly nextSteps!: string;
}
export class CorrectTeachingNoteInput extends TeachingNoteInput {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  readonly reason!: string;
}
export class TeachingNoteDto {
  @ApiProperty() readonly content!: string;
  @ApiProperty() readonly nextSteps!: string;
  @ApiProperty() readonly version!: number;
  @ApiProperty({ format: 'uuid' }) readonly createdBy!: string;
  @ApiProperty({ format: 'uuid' }) readonly updatedBy!: string;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) readonly updatedAt!: string;
}
export class TeachingNoteResponseDto {
  @ApiProperty({ format: 'uuid' }) readonly sessionId!: string;
  @ApiProperty() readonly version!: number;
  @ApiProperty({ type: () => TeachingNoteDto, nullable: true })
  readonly note!: TeachingNoteDto | null;
}
