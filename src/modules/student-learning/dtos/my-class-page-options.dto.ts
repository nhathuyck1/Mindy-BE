import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { DeliveryMode } from '../../classes/enums/delivery-mode.enum.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import { MyClassView } from '../enums/my-class-view.enum.js';

export class MyClassPageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({
    type: String,
    enum: MyClassView,
    default: MyClassView.CURRENT,
    description:
      'current: ACTIVE/COMPLETED and unexpired holds of a PENDING order; history: cancelled, expired or closed holds; all: both',
  })
  @IsOptional()
  @IsEnum(MyClassView)
  readonly view: MyClassView = MyClassView.CURRENT;

  @ApiPropertyOptional({ type: String, enum: EnrollmentStatus })
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  readonly enrollmentStatus?: EnrollmentStatus;

  @ApiPropertyOptional({ type: String, enum: ClassStatus })
  @IsOptional()
  @IsEnum(ClassStatus)
  readonly classStatus?: ClassStatus;

  @ApiPropertyOptional({ type: String, enum: DeliveryMode })
  @IsOptional()
  @IsEnum(DeliveryMode)
  readonly deliveryMode?: DeliveryMode;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  readonly courseId?: string;
}
