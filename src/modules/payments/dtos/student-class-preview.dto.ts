import { ApiProperty } from '@nestjs/swagger';
import type { ClassDetailView, LearnerEnrollmentView } from '../../classes/domain/class-views.js';
import { ClassDetailDto } from '../../classes/dtos/class.dto.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';

/** Pending CASH class read: the public detail plus the hold that authorizes it. */
export interface CashPreviewView extends ClassDetailView {
  readonly enrollment: LearnerEnrollmentView;
  readonly order: { readonly id: string; readonly orderCode: string; readonly expiresAt: Date };
}

/**
 * Titles, timetable and room only; never meeting URLs. Extends the public detail DTO with the
 * student's hold context (Phase 2.3, additive).
 */
export class StudentClassPreviewDto extends ClassDetailDto {
  @ApiProperty({ type: String, enum: ClassStatus }) readonly classStatus: ClassStatus;
  @ApiProperty({ type: String, format: 'uuid' }) readonly enrollmentId: string;
  @ApiProperty({ type: String, enum: EnrollmentStatus, example: EnrollmentStatus.PENDING_PAYMENT })
  readonly enrollmentStatus: EnrollmentStatus;
  @ApiProperty({ type: String, format: 'uuid' }) readonly orderId: string;
  @ApiProperty({ type: String }) readonly orderCode: string;
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Hold deadline; preview is denied from this instant even before the expiry job',
  })
  readonly expiresAt: Date;
  @ApiProperty({ type: String, enum: ['CASH_PREVIEW'] }) readonly accessMode: 'CASH_PREVIEW';

  constructor(view: CashPreviewView) {
    super(view);
    this.classStatus = view.classEntity.status;
    this.enrollmentId = view.enrollment.id;
    this.enrollmentStatus = view.enrollment.status;
    this.orderId = view.order.id;
    this.orderCode = view.order.orderCode;
    this.expiresAt = view.order.expiresAt;
    this.accessMode = 'CASH_PREVIEW';
  }
}
