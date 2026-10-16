import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateCourseUnitDto {
  @ApiPropertyOptional({ type: String, maxLength: 250 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 250)
  @Matches(/\S/)
  readonly title?: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 10000,
    description: 'Unit overview. Rich lesson HTML belongs to Material ARTICLE.contentHtml.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  readonly description?: string | null;
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  readonly requiredScorePercent?: number;
}
