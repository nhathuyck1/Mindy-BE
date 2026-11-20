import { ApiProperty } from '@nestjs/swagger';

import { ClassMentorDto } from '../../classes/dtos/class.dto.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { DeliveryMode } from '../../classes/enums/delivery-mode.enum.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import { LearningAccessMode } from '../enums/learning-access-mode.enum.js';
import { LearningAccessReason } from '../enums/learning-access-reason.enum.js';
import type { MyClassItem, MyClassOrderSummary } from '../services/my-classes.service.js';

/** The own order that created this enrollment; one order may cover several classes. */
export class MyClassOrderDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Use with GET /me/orders/:orderId' })
  readonly orderId: string;
  @ApiProperty({ type: String, example: 'MD20261009ABCDEF' })
  readonly orderCode: string;
  @ApiProperty({ type: String, enum: OrderStatus })
  readonly orderStatus: OrderStatus;
  @ApiProperty({ type: String, enum: PaymentType })
  readonly paymentType: PaymentType;
  @ApiProperty({ type: String, format: 'date-time' })
  readonly expiresAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly paidAt: Date | null;
  @ApiProperty({
    type: Boolean,
    description: 'The payment attempt needs staff reconciliation; do not offer to pay again',
  })
  readonly requiresReview: boolean;

  constructor(order: MyClassOrderSummary) {
    this.orderId = order.orderId;
    this.orderCode = order.orderCode;
    this.orderStatus = order.orderStatus;
    this.paymentType = order.paymentType;
    this.expiresAt = order.expiresAt;
    this.paidAt = order.paidAt;
    this.requiresReview = order.requiresReview;
  }
}

/** One enrollment of the signed-in student. Never carries meeting URLs or payment payloads. */
export class MyClassDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Row key; one row per enrollment' })
  readonly enrollmentId: string;
  @ApiProperty({ type: String, enum: EnrollmentStatus })
  readonly enrollmentStatus: EnrollmentStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly enrolledAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: Date;
  @ApiProperty({
    type: Boolean,
    description: 'Pending hold past its deadline, even if the expiry job has not run yet',
  })
  readonly isHoldExpired: boolean;

  @ApiProperty({ type: String, format: 'uuid' })
  readonly courseId: string;
  @ApiProperty({ type: String })
  readonly courseCode: string;
  @ApiProperty({ type: String })
  readonly courseTitle: string;
  @ApiProperty({ type: String, nullable: true })
  readonly courseImageUrl: string | null;

  @ApiProperty({ type: String, format: 'uuid' })
  readonly classId: string;
  @ApiProperty({ type: String })
  readonly classCode: string;
  @ApiProperty({ type: String })
  readonly className: string;
  @ApiProperty({ type: String, enum: ClassStatus })
  readonly classStatus: ClassStatus;
  @ApiProperty({ type: String, enum: DeliveryMode })
  readonly deliveryMode: DeliveryMode;
  @ApiProperty({ type: String, format: 'date' })
  readonly startDate: string;
  @ApiProperty({ type: String, format: 'date' })
  readonly endDate: string;
  @ApiProperty({ type: () => ClassMentorDto, description: 'Current class mentor' })
  readonly mentor: ClassMentorDto;

  @ApiProperty({
    type: () => MyClassOrderDto,
    nullable: true,
    description: 'Null only when the enrollment/order chain is inconsistent (STATE_MISMATCH)',
  })
  readonly order: MyClassOrderDto | null;

  @ApiProperty({
    type: String,
    enum: LearningAccessMode,
    description:
      'FULL → GET /me/classes/:classId; CASH_PREVIEW → GET /me/classes/:classId/preview; NONE → summary only',
  })
  readonly accessMode: LearningAccessMode;
  @ApiProperty({ type: String, enum: LearningAccessReason })
  readonly accessReason: LearningAccessReason;
  @ApiProperty({ type: Boolean, description: 'Read-time hint; detail endpoints re-check access' })
  readonly canViewClass: boolean;
  @ApiProperty({ type: Boolean, description: 'Sessions of this class appear in /me/schedule' })
  readonly canViewSchedule: boolean;

  constructor(item: MyClassItem) {
    this.enrollmentId = item.enrollmentId;
    this.enrollmentStatus = item.enrollmentStatus;
    this.enrolledAt = item.enrolledAt;
    this.createdAt = item.createdAt;
    this.isHoldExpired = item.access.isHoldExpired;
    this.courseId = item.courseId;
    this.courseCode = item.courseCode;
    this.courseTitle = item.courseTitle;
    this.courseImageUrl = item.courseImageUrl;
    this.classId = item.classId;
    this.classCode = item.classCode;
    this.className = item.className;
    this.classStatus = item.classStatus;
    this.deliveryMode = item.deliveryMode;
    this.startDate = item.startDate;
    this.endDate = item.endDate;
    this.mentor = new ClassMentorDto(item.mentorId, item.mentorName);
    this.order = item.order === null ? null : new MyClassOrderDto(item.order);
    this.accessMode = item.access.mode;
    this.accessReason = item.access.reason;
    this.canViewClass = item.access.mode !== LearningAccessMode.NONE;
    this.canViewSchedule = item.access.mode !== LearningAccessMode.NONE;
  }
}

export class MyClassPageDto {
  @ApiProperty({ type: () => MyClassDto, isArray: true })
  readonly items: MyClassDto[];
  @ApiProperty({ type: Number, example: 1 })
  readonly page: number;
  @ApiProperty({ type: Number, example: 20 })
  readonly pageSize: number;
  @ApiProperty({ type: Number, example: 3 })
  readonly total: number;
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Server time used for every deadline in this response',
  })
  readonly asOf: Date;

  constructor(items: MyClassDto[], page: number, pageSize: number, total: number, asOf: Date) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
    this.asOf = asOf;
  }
}
