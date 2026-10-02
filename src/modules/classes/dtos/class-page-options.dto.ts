import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import { DeliveryMode } from '../enums/delivery-mode.enum.js';

export class AdminClassPageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly courseId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly mentorId?: string;

  @ApiPropertyOptional({ type: String, enum: ClassStatus })
  @IsOptional()
  @IsEnum(ClassStatus)
  readonly status?: ClassStatus;

  @ApiPropertyOptional({ type: String, enum: DeliveryMode })
  @IsOptional()
  @IsEnum(DeliveryMode)
  readonly deliveryMode?: DeliveryMode;
}
