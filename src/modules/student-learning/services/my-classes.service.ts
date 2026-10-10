import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager, type SelectQueryBuilder } from 'typeorm';

import { CourseEntity } from '../../catalog/entities/course.entity.js';
import { ClassEntity } from '../../classes/entities/class.entity.js';
import type { ClassStatus } from '../../classes/enums/class-status.enum.js';
import type { DeliveryMode } from '../../classes/enums/delivery-mode.enum.js';
import { OrderEntity } from '../../commerce/entities/order.entity.js';
import { OrderDetailEntity } from '../../commerce/entities/order-detail.entity.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import type { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { EnrollmentEntity } from '../../enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import { PaymentTransactionEntity } from '../../payments/entities/payment-transaction.entity.js';
import { PaymentStatus } from '../../payments/enums/payment-status.enum.js';
import { UserEntity } from '../../users/user.entity.js';
import { evaluateLearningAccess, type LearningAccess } from '../domain/learning-access.js';
import type { MyClassPageOptionsDto } from '../dtos/my-class-page-options.dto.js';
import { MyClassView } from '../enums/my-class-view.enum.js';
import { inReadSnapshot } from './read-snapshot.js';

export interface MyClassOrderSummary {
  readonly orderId: string;
  readonly orderCode: string;
  readonly orderStatus: OrderStatus;
  readonly paymentType: PaymentType;
  readonly expiresAt: Date;
  readonly paidAt: Date | null;
  readonly requiresReview: boolean;
}

export interface MyClassItem {
  readonly enrollmentId: string;
  readonly enrollmentStatus: EnrollmentStatus;
  readonly enrolledAt: Date | null;
  readonly createdAt: Date;
  readonly courseId: string;
  readonly courseCode: string;
  readonly courseTitle: string;
  readonly courseImageUrl: string | null;
  readonly classId: string;
  readonly classCode: string;
  readonly className: string;
  readonly classStatus: ClassStatus;
  readonly deliveryMode: DeliveryMode;
  readonly startDate: string;
  readonly endDate: string;
  readonly mentorId: string;
  readonly mentorName: string | null;
  readonly order: MyClassOrderSummary | null;
  readonly access: LearningAccess;
}

export interface MyClassPage {
  readonly items: MyClassItem[];
  readonly total: number;
  readonly asOf: Date;
}

interface MyClassRow {
  enrollmentId: string;
  enrollmentStatus: EnrollmentStatus;
  enrolledAt: Date | null;
  createdAt: Date;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  courseImageUrl: string | null;
  classId: string;
  classCode: string;
  className: string;
  classStatus: ClassStatus;
  deliveryMode: DeliveryMode;
  startDate: string;
  endDate: string;
  mentorId: string;
  mentorName: string | null;
  orderId: string | null;
  orderCode: string | null;
  orderStatus: OrderStatus | null;
  paymentType: PaymentType | null;
  expiresAt: Date | null;
  paidAt: Date | null;
  paymentStatus: PaymentStatus | null;
}

/**
 * SQL twin of `LearningAccess.isCurrent`: a consistent own-order chain and either a settled
 * enrollment or an unexpired hold of a still PENDING order.
 */
const CURRENT_ENROLLMENT = `(purchase.id IS NOT NULL AND (
  enrollment.status IN (:...settledStatuses)
  OR (enrollment.status = :pendingStatus AND purchase.status = :pendingOrder AND purchase.expiresAt > :now)
))`;

/**
 * My Classes read projection: one row per enrollment of the principal, joined one-to-one to
 * class, course, current mentor, own order and its single payment transaction. Reads entities
 * owned by other modules but never writes them.
 */
@Injectable()
export class MyClassesService {
  constructor(private readonly dataSource: DataSource) {}

  async list(
    studentId: string,
    options: MyClassPageOptionsDto,
    now: Date = new Date(),
  ): Promise<MyClassPage> {
    return inReadSnapshot(this.dataSource, async (manager) => {
      const query = this.filteredQuery(manager, studentId, options, now);
      const total = await query.getCount();
      if (total === 0) {
        return { items: [], total, asOf: now };
      }

      const rows = await query
        .select('enrollment.id', 'enrollmentId')
        .addSelect('enrollment.status', 'enrollmentStatus')
        .addSelect('enrollment.enrolledAt', 'enrolledAt')
        .addSelect('enrollment.createdAt', 'createdAt')
        .addSelect('course.id', 'courseId')
        .addSelect('course.code', 'courseCode')
        .addSelect('course.title', 'courseTitle')
        .addSelect('course.imgUrl', 'courseImageUrl')
        .addSelect('class.id', 'classId')
        .addSelect('class.code', 'classCode')
        .addSelect('class.name', 'className')
        .addSelect('class.status', 'classStatus')
        .addSelect('class.deliveryMode', 'deliveryMode')
        .addSelect('CAST(class.startDate AS text)', 'startDate')
        .addSelect('CAST(class.endDate AS text)', 'endDate')
        .addSelect('class.mentorId', 'mentorId')
        .addSelect('mentor.displayName', 'mentorName')
        .addSelect('purchase.id', 'orderId')
        .addSelect('purchase.orderCode', 'orderCode')
        .addSelect('purchase.status', 'orderStatus')
        .addSelect('purchase.paymentType', 'paymentType')
        .addSelect('purchase.expiresAt', 'expiresAt')
        .addSelect('purchase.paidAt', 'paidAt')
        .addSelect('payment.status', 'paymentStatus')
        .orderBy('enrollment.createdAt', 'DESC')
        .addOrderBy('enrollment.id', 'ASC')
        .offset((options.page - 1) * options.pageSize)
        .limit(options.pageSize)
        .getRawMany<MyClassRow>();
      return { items: rows.map((row) => toItem(row, now)), total, asOf: now };
    });
  }

  /** Filters and access classification run in SQL, before count and pagination. */
  private filteredQuery(
    manager: EntityManager,
    studentId: string,
    options: MyClassPageOptionsDto,
    now: Date,
  ): SelectQueryBuilder<EnrollmentEntity> {
    const query = manager
      .getRepository(EnrollmentEntity)
      .createQueryBuilder('enrollment')
      .innerJoin(ClassEntity, 'class', 'class.id = enrollment.classId')
      .innerJoin(CourseEntity, 'course', 'course.id = class.courseId')
      .leftJoin(UserEntity, 'mentor', 'mentor.id = class.mentorId')
      .leftJoin(
        OrderDetailEntity,
        'detail',
        'detail.id = enrollment.orderDetailId AND detail.classId = enrollment.classId',
      )
      .leftJoin(
        OrderEntity,
        'purchase',
        'purchase.id = detail.orderId AND purchase.studentId = enrollment.studentId',
      )
      .leftJoin(PaymentTransactionEntity, 'payment', 'payment.orderId = purchase.id')
      .where('enrollment.studentId = :studentId', { studentId })
      .setParameters({
        settledStatuses: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED],
        pendingStatus: EnrollmentStatus.PENDING_PAYMENT,
        pendingOrder: OrderStatus.PENDING,
        now,
      });
    if (options.view === MyClassView.CURRENT) {
      query.andWhere(CURRENT_ENROLLMENT);
    }
    if (options.view === MyClassView.HISTORY) {
      query.andWhere(`NOT ${CURRENT_ENROLLMENT}`);
    }
    if (options.enrollmentStatus !== undefined) {
      query.andWhere('enrollment.status = :enrollmentStatus', {
        enrollmentStatus: options.enrollmentStatus,
      });
    }
    if (options.classStatus !== undefined) {
      query.andWhere('class.status = :classStatus', { classStatus: options.classStatus });
    }
    if (options.deliveryMode !== undefined) {
      query.andWhere('class.deliveryMode = :deliveryMode', { deliveryMode: options.deliveryMode });
    }
    if (options.courseId !== undefined) {
      query.andWhere('class.courseId = :courseId', { courseId: options.courseId });
    }

    return query;
  }
}

function toItem(row: MyClassRow, now: Date): MyClassItem {
  const order =
    row.orderId === null ||
    row.orderCode === null ||
    row.orderStatus === null ||
    row.paymentType === null ||
    row.expiresAt === null
      ? null
      : {
          orderId: row.orderId,
          orderCode: row.orderCode,
          orderStatus: row.orderStatus,
          paymentType: row.paymentType,
          expiresAt: row.expiresAt,
          paidAt: row.paidAt,
          requiresReview: row.paymentStatus === PaymentStatus.REQUIRES_REVIEW,
        };
  return {
    enrollmentId: row.enrollmentId,
    enrollmentStatus: row.enrollmentStatus,
    enrolledAt: row.enrolledAt,
    createdAt: row.createdAt,
    courseId: row.courseId,
    courseCode: row.courseCode,
    courseTitle: row.courseTitle,
    courseImageUrl: row.courseImageUrl,
    classId: row.classId,
    classCode: row.classCode,
    className: row.className,
    classStatus: row.classStatus,
    deliveryMode: row.deliveryMode,
    startDate: row.startDate,
    endDate: row.endDate,
    mentorId: row.mentorId,
    mentorName: row.mentorName,
    order,
    access: evaluateLearningAccess(
      {
        enrollmentStatus: row.enrollmentStatus,
        classStatus: row.classStatus,
        order:
          order === null
            ? null
            : {
                status: order.orderStatus,
                paymentType: order.paymentType,
                expiresAt: order.expiresAt,
              },
      },
      now,
    ),
  };
}
