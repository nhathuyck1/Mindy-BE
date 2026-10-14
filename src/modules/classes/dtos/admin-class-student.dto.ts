import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import { UserStatus } from '../../users/user-status.enum.js';
import type { AdminClassStudentView } from '../domain/class-views.js';

export class AdminClassStudentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly studentId: string;

  @ApiProperty({ type: String })
  readonly studentName: string;

  @ApiProperty({ type: String, format: 'email' })
  readonly email: string;

  @ApiProperty({ type: String, nullable: true })
  readonly phone: string | null;

  @ApiProperty({ enum: UserStatus })
  readonly studentStatus: UserStatus;

  @ApiProperty({ type: String, format: 'uuid' })
  readonly enrollmentId: string;

  @ApiProperty({ enum: EnrollmentStatus })
  readonly enrollmentStatus: EnrollmentStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly enrolledAt: Date | null;

  constructor({ student, enrollment }: AdminClassStudentView) {
    this.studentId = student.id;
    this.studentName = student.displayName;
    this.email = student.email;
    this.phone = student.phone;
    this.studentStatus = student.status;
    this.enrollmentId = enrollment.id;
    this.enrollmentStatus = enrollment.status;
    this.enrolledAt = enrollment.enrolledAt;
  }
}

export class AdminClassStudentDetailDto extends AdminClassStudentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly classId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  readonly orderDetailId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly registeredAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly accountCreatedAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly lastLoginAt: Date | null;

  constructor(view: AdminClassStudentView) {
    super(view);
    this.classId = view.enrollment.classId;
    this.orderDetailId = view.enrollment.orderDetailId;
    this.registeredAt = view.enrollment.createdAt;
    this.accountCreatedAt = view.student.createdAt;
    this.lastLoginAt = view.student.lastLoginAt;
  }
}

export class AdminClassStudentPageDto {
  @ApiProperty({ type: () => AdminClassStudentDto, isArray: true })
  readonly items: AdminClassStudentDto[];

  @ApiProperty({ type: Number })
  readonly page: number;

  @ApiProperty({ type: Number })
  readonly pageSize: number;

  @ApiProperty({ type: Number })
  readonly total: number;

  constructor(items: AdminClassStudentDto[], page: number, pageSize: number, total: number) {
    this.items = items;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
  }
}
