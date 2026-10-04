import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ type: Number, example: 409 })
  readonly statusCode!: number;

  @ApiProperty({ type: String, example: 'CLASS_FULL' })
  readonly code!: string;

  @ApiProperty({ type: String, example: 'The class has no seats left' })
  readonly message!: string;

  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  readonly details?: readonly unknown[];

  @ApiPropertyOptional({ type: String })
  readonly requestId?: string;
}
