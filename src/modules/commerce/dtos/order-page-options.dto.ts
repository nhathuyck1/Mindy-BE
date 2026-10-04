import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { OrderStatus } from '../enums/order-status.enum.js';

export class OrderPageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  readonly status?: OrderStatus;
}
