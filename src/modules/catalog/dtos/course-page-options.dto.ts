import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';

function toBoolean(value: unknown): unknown {
  if (value === 'true') {
    return true;
  }

  return value === 'false' ? false : value;
}

export class AdminCoursePageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly categoryId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  readonly isActive?: boolean;
}
