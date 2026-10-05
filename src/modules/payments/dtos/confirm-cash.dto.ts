import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class ConfirmCashDto {
  @ApiProperty({
    type: Number,
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
    description: 'Full amount collected in VND; must equal order total',
  })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  readonly receivedAmount!: number;
}
