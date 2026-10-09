import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import type { ClassView } from '../../classes/domain/class-views.js';
import { ClassDto } from '../../classes/dtos/class.dto.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';

export class MentorClassPageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: ClassStatus })
  @IsOptional()
  @IsEnum(ClassStatus)
  readonly status?: ClassStatus;
}

export class MentorRosterPageOptionsDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: PaymentType, description: 'Phase 2 accepts CASH or PAYOS' })
  @IsOptional()
  @IsEnum(PaymentType)
  readonly paymentType?: PaymentType;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  readonly orderStatus?: OrderStatus;
}

export class MentorClassDto extends ClassDto {
  @ApiProperty({ enum: ClassStatus })
  readonly status: ClassStatus;

  constructor(view: ClassView) {
    super(view);
    this.status = view.classEntity.status;
  }
}

export class MentorClassPageDto {
  @ApiProperty({ type: () => MentorClassDto, isArray: true })
  readonly items: MentorClassDto[];
  @ApiProperty({ type: Number })
  readonly page: number;
  @ApiProperty({ type: Number })
  readonly pageSize: number;
  @ApiProperty({ type: Number })
  readonly total: number;

  constructor(items: MentorClassDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}

export interface MentorRosterRow {
  readonly enrollmentId: string;
  readonly enrollmentStatus: EnrollmentStatus;
  readonly studentId: string;
  readonly studentName: string;
  readonly orderId: string;
  readonly orderCode: string;
  readonly orderStatus: OrderStatus;
  readonly paymentType: PaymentType;
  readonly classAmount: number;
  readonly orderTotalAmount: number;
  readonly orderClassCount: number;
  readonly expiresAt: Date;
  readonly paidAt: Date | null;
  readonly canConfirmCash: boolean;
}

export class MentorRosterStudentDto implements MentorRosterRow {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly enrollmentId: string;
  @ApiProperty({ enum: EnrollmentStatus })
  readonly enrollmentStatus: EnrollmentStatus;
  @ApiProperty({ type: String, format: 'uuid' })
  readonly studentId: string;
  @ApiProperty({ type: String })
  readonly studentName: string;
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Pass to POST /mentor/cash-orders/:orderId/confirm',
  })
  readonly orderId: string;
  @ApiProperty({ type: String })
  readonly orderCode: string;
  @ApiProperty({ enum: OrderStatus })
  readonly orderStatus: OrderStatus;
  @ApiProperty({ enum: PaymentType })
  readonly paymentType: PaymentType;
  @ApiProperty({ type: Number, description: 'Amount for this class in the immutable order detail' })
  readonly classAmount: number;
  @ApiProperty({
    type: Number,
    description: 'Full order amount required for cash confirmation; may cover multiple classes',
  })
  readonly orderTotalAmount: number;
  @ApiProperty({ type: Number })
  readonly orderClassCount: number;
  @ApiProperty({ type: String, format: 'date-time' })
  readonly expiresAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly paidAt: Date | null;
  @ApiProperty({
    type: Boolean,
    description: 'Read-time hint; confirmation rechecks all rules transactionally',
  })
  readonly canConfirmCash: boolean;

  constructor(row: MentorRosterRow) {
    this.enrollmentId = row.enrollmentId;
    this.enrollmentStatus = row.enrollmentStatus;
    this.studentId = row.studentId;
    this.studentName = row.studentName;
    this.orderId = row.orderId;
    this.orderCode = row.orderCode;
    this.orderStatus = row.orderStatus;
    this.paymentType = row.paymentType;
    this.classAmount = row.classAmount;
    this.orderTotalAmount = row.orderTotalAmount;
    this.orderClassCount = row.orderClassCount;
    this.expiresAt = row.expiresAt;
    this.paidAt = row.paidAt;
    this.canConfirmCash = row.canConfirmCash;
  }
}

export class MentorRosterPageDto {
  @ApiProperty({ type: () => MentorRosterStudentDto, isArray: true })
  readonly items: MentorRosterStudentDto[];
  @ApiProperty({ type: Number })
  readonly page: number;
  @ApiProperty({ type: Number })
  readonly pageSize: number;
  @ApiProperty({ type: Number })
  readonly total: number;

  constructor(items: MentorRosterStudentDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}
