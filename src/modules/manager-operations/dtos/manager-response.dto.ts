import { ApiProperty } from '@nestjs/swagger';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { TeachingSessionDto } from '../../classes/dtos/teaching.dto.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { ClassUnitStatus } from '../../classes/enums/class-unit-status.enum.js';
import { OrderDto } from '../../commerce/dtos/order.dto.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import { MentorClassDto } from '../../payments/dtos/mentor-class-roster.dto.js';
import { PaymentStatus } from '../../payments/enums/payment-status.enum.js';
import { UserDto } from '../../users/dtos/user.dto.js';
export class ManagerPersonDto extends UserDto {}
export class ManagerCourseSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly id!: string;
  @ApiProperty({ type: String }) readonly code!: string;
  @ApiProperty({ type: String }) readonly title!: string;
}
export class ManagerEnrollmentCountsDto {
  @ApiProperty({ type: Number }) readonly PENDING_PAYMENT!: number;
  @ApiProperty({ type: Number }) readonly ACTIVE!: number;
  @ApiProperty({ type: Number }) readonly COMPLETED!: number;
  @ApiProperty({ type: Number }) readonly CANCELLED!: number;
}
export class ManagerClassDetailDto extends MentorClassDto {
  @ApiProperty({ type: () => ManagerCourseSummaryDto }) readonly course!: ManagerCourseSummaryDto;
  @ApiProperty({ type: String, nullable: true }) readonly roomName!: string | null;
  @ApiProperty({ type: Number }) readonly unitCount!: number;
  @ApiProperty({ type: Number }) readonly sessionCount!: number;
  @ApiProperty({ type: () => ManagerEnrollmentCountsDto })
  readonly enrollmentCounts!: ManagerEnrollmentCountsDto;
}
export class ManagerClassUnitDto {
  @ApiProperty({ type: String, format: 'uuid' }) readonly id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) readonly courseUnitId!: string;
  @ApiProperty({ type: String }) readonly title!: string;
  @ApiProperty({ type: Number }) readonly position!: number;
  @ApiProperty({ enum: ClassUnitStatus }) readonly status!: ClassUnitStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly unlockAt!: Date | null;
}
export class ManagerMentorClassDto extends MentorClassDto {
  @ApiProperty({ enum: ['PRIMARY', 'SUBSTITUTE', 'BOTH'] }) readonly assignmentType!:
    | 'PRIMARY'
    | 'SUBSTITUTE'
    | 'BOTH';
}
export class ManagerEnrollmentClassDto {
  @ApiProperty({ type: String }) readonly id!: string;
  @ApiProperty({ type: String }) readonly code!: string;
  @ApiProperty({ type: String }) readonly name!: string;
  @ApiProperty({ type: String }) readonly courseId!: string;
  @ApiProperty({ enum: ClassStatus }) readonly status!: ClassStatus;
}
export class ManagerStudentEnrollmentDto {
  @ApiProperty({ type: String }) readonly enrollmentId!: string;
  @ApiProperty({ enum: EnrollmentStatus }) readonly enrollmentStatus!: EnrollmentStatus;
  @ApiProperty({ type: String, format: 'date-time' }) readonly registeredAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly enrolledAt!: Date | null;
  @ApiProperty({ type: () => ManagerEnrollmentClassDto })
  readonly class!: ManagerEnrollmentClassDto;
  @ApiProperty({ type: String }) readonly orderDetailId!: string;
  @ApiProperty({ type: String }) readonly orderId!: string;
  @ApiProperty({ enum: OrderStatus }) readonly orderStatus!: OrderStatus;
  @ApiProperty({ enum: PaymentType }) readonly paymentType!: PaymentType;
}
export class ManagerStudentSummaryDto {
  @ApiProperty({ type: String }) readonly id!: string;
  @ApiProperty({ type: String, nullable: true }) readonly displayName!: string | null;
}
export class CashCollectorDto {
  @ApiProperty({ type: String }) readonly id!: string;
  @ApiProperty({ type: String, nullable: true }) readonly displayName!: string | null;
  @ApiProperty({ enum: ['MANAGER', 'LEGACY_MENTOR'] }) readonly source!:
    | 'MANAGER'
    | 'LEGACY_MENTOR';
}
export class ManagerReviewDto {
  @ApiProperty({ enum: ['REQUIRES_REVIEW'] }) readonly outcome!: 'REQUIRES_REVIEW';
  @ApiProperty({ type: String, nullable: true }) readonly reason!: string | null;
}
export class ManagerPaymentDto {
  @ApiProperty({ type: String }) readonly id!: string;
  @ApiProperty({ type: String }) readonly orderId!: string;
  @ApiProperty({ type: Number }) readonly amount!: number;
  @ApiProperty({ enum: PaymentStatus }) readonly status!: PaymentStatus;
  @ApiProperty({ enum: PaymentType }) readonly paymentType!: PaymentType;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readonly paidAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) readonly createdAt!: Date;
  @ApiProperty({ type: String, nullable: true }) readonly referenceCode!: string | null;
  @ApiProperty({ type: Number, nullable: true }) readonly providerOrderCode!: number | null;
  @ApiProperty({ type: () => CashCollectorDto, nullable: true })
  readonly confirmedBy!: CashCollectorDto | null;
  @ApiProperty({ type: () => ManagerReviewDto, nullable: true })
  readonly review!: ManagerReviewDto | null;
  @ApiProperty({ type: () => ManagerStudentSummaryDto })
  readonly student!: ManagerStudentSummaryDto;
  @ApiProperty({ type: String }) readonly orderCode!: string;
  @ApiProperty({ enum: OrderStatus }) readonly orderStatus!: OrderStatus;
}
export class ManagerOrderSummaryDto {
  @ApiProperty({ type: String }) readonly id!: string;
  @ApiProperty({ type: String }) readonly orderCode!: string;
  @ApiProperty({ type: Number }) readonly totalAmount!: number;
  @ApiProperty({ enum: PaymentType }) readonly paymentType!: PaymentType;
  @ApiProperty({ enum: OrderStatus }) readonly status!: OrderStatus;
  @ApiProperty({ type: String, format: 'date-time' }) readonly expiresAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readonly paidAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) readonly createdAt!: Date;
  @ApiProperty({ type: () => ManagerStudentSummaryDto })
  readonly student!: ManagerStudentSummaryDto;
  @ApiProperty({ type: () => ManagerPaymentDto, nullable: true })
  readonly payment!: ManagerPaymentDto | null;
}
export class ManagerOrderDetailDto extends OrderDto {
  @ApiProperty({ type: () => ManagerStudentSummaryDto })
  readonly student!: ManagerStudentSummaryDto;
  @ApiProperty({ type: () => ManagerPaymentDto, nullable: true })
  readonly payment!: ManagerPaymentDto | null;
}
export class ManagerPeoplePageDto {
  @ApiProperty({ type: () => ManagerPersonDto, isArray: true }) readonly items!: ManagerPersonDto[];
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: Number }) readonly total!: number;
}
export class ManagerUnitsPageDto {
  @ApiProperty({ type: () => ManagerClassUnitDto, isArray: true })
  readonly items!: ManagerClassUnitDto[];
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: Number }) readonly total!: number;
}
export class ManagerMentorClassesPageDto {
  @ApiProperty({ type: () => ManagerMentorClassDto, isArray: true })
  readonly items!: ManagerMentorClassDto[];
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: Number }) readonly total!: number;
}
export class ManagerStudentClassesPageDto {
  @ApiProperty({ type: () => ManagerStudentEnrollmentDto, isArray: true })
  readonly items!: ManagerStudentEnrollmentDto[];
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: Number }) readonly total!: number;
}
export class ManagerOrdersPageDto {
  @ApiProperty({ type: () => ManagerOrderSummaryDto, isArray: true })
  readonly items!: ManagerOrderSummaryDto[];
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: Number }) readonly total!: number;
}
export class ManagerPaymentsPageDto {
  @ApiProperty({ type: () => ManagerPaymentDto, isArray: true })
  readonly items!: ManagerPaymentDto[];
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: Number }) readonly total!: number;
}
export class ManagerSchedulePageDto {
  @ApiProperty({ type: () => TeachingSessionDto, isArray: true })
  readonly items!: TeachingSessionDto[];
  @ApiProperty({ type: Number }) readonly page!: number;
  @ApiProperty({ type: Number }) readonly pageSize!: number;
  @ApiProperty({ type: Number }) readonly total!: number;
  @ApiProperty({ type: String, format: 'date-time' }) readonly from!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) readonly to!: Date;
  @ApiProperty({ type: String }) readonly timeZone!: string;
}
export function managerPage<T>(
  items: T[],
  total: number,
  options: PageOptionsDto,
): { items: T[]; total: number; page: number; pageSize: number } {
  return { items, total, page: options.page, pageSize: options.pageSize };
}
