import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AddCourseUnitDto {
  @ApiProperty({ type: String, example: 'HTML & CSS basics', maxLength: 250 })
  @IsString()
  @Length(1, 250)
  @Matches(/\S/, { message: 'title must contain at least one non-space character' })
  readonly title!: string;

  @ApiPropertyOptional({ type: String, maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  readonly description?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100, default: 80 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  readonly requiredScorePercent?: number;
}
