import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Upper bound keeps cart and order totals inside safe integer arithmetic. */
export const MAX_PRICE_AMOUNT = 1_000_000_000_000;

export class CreateCourseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  readonly categoryId!: string;

  @ApiProperty({ type: String, example: 'WEB101', minLength: 2, maxLength: 50 })
  @IsString()
  @Length(2, 50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, {
    message: 'code must contain letters, digits, hyphens or underscores only',
  })
  readonly code!: string;

  @ApiProperty({ type: String, example: 'Web Development Fundamentals', maxLength: 250 })
  @IsString()
  @Length(1, 250)
  readonly title!: string;

  @ApiPropertyOptional({ type: String, maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  readonly description?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uri',
    nullable: true,
    maxLength: 2048,
    example: 'https://cdn.example.com/courses/web101.jpg',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, disallow_auth: true })
  @MaxLength(2048)
  readonly imgUrl?: string | null;

  @ApiProperty({
    type: Number,
    example: 2_500_000,
    minimum: 0,
    maximum: MAX_PRICE_AMOUNT,
    description: 'Integer VND amount',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_AMOUNT)
  readonly priceAmount!: number;
}
