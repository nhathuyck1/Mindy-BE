import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateCourseCategoryDto {
  @ApiProperty({ type: String, example: 'Lập trình Web', minLength: 1, maxLength: 150 })
  @IsString()
  @Length(1, 150)
  readonly name!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'lap-trinh-web',
    maxLength: 180,
    description: 'Lower-case URL slug. Generated from the name when omitted.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 180)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must contain lower-case letters, digits and single hyphens only',
  })
  readonly slug?: string;

  @ApiPropertyOptional({ type: String, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly description?: string;
}
