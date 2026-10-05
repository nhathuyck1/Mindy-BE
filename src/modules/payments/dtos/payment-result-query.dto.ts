import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class PaymentResultQueryDto {
  @ApiProperty({
    type: String,
    pattern: '^[1-9][0-9]{0,15}$',
    description: 'payOS redirect orderCode as a decimal string',
  })
  @Matches(/^[1-9][0-9]{0,15}$/)
  readonly orderCode!: string;
}
