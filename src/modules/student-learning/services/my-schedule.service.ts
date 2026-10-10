import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager, type SelectQueryBuilder } from 'typeorm';

import { CourseEntity } from '../../catalog/entities/course.entity.js';
import { CourseUnitEntity } from '../../catalog/entities/course-unit.entity.js';
import { ClassEntity } from '../../classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../classes/entities/class-session.entity.js';
import { ClassUnitEntity } from '../../classes/entities/class-unit.entity.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import type { DeliveryMode } from '../../classes/enums/delivery-mode.enum.js';
import { SessionStatus } from '../../classes/enums/session-status.enum.js';
import { OrderEntity } from '../../commerce/entities/order.entity.js';
import { OrderDetailEntity } from '../../commerce/entities/order-detail.entity.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { EnrollmentEntity } from '../../enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import { UserEntity } from '../../users/user.entity.js';
import { LearningAccessMode } from '../enums/learning-access-mode.enum.js';
import { ScheduleClassAccessDeniedException } from '../exceptions/student-learning.exceptions.js';
import { inReadSnapshot } from './read-snapshot.js';

export interface ScheduleQuery {
  /** Inclusive start of the `[from, to)` range. */
  readonly from: Date;
  /** Exclusive end of the `[from, to)` range. */
  readonly to: Date;
  readonly page: number;
  readonly pageSize: number;
  readonly classId?: string;
  readonly includeCancelled: boolean;
}

export interface ScheduleEvent {
  readonly sessionId: string;
  readonly sessionNumber: number;
  readonly sessionTitle: string;
  readonly sessionStatus: SessionStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly roomName: string | null;
  readonly classId: string;
  readonly classCode: string;
  readonly className: string;
  readonly classStatus: ClassStatus;
  readonly courseId: string;
  readonly courseTitle: string;
  readonly classUnitId: string;
  readonly unitTitle: string;
  readonly deliveryMode: DeliveryMode;
  readonly mentorId: string;
  readonly mentorName: string | null;
  readonly enrollmentId: string;
  readonly accessMode: LearningAccessMode;
}

export interface SchedulePage {
  readonly items: ScheduleEvent[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly timeZone: string;
  readonly from: Date;
  readonly to: Date;
  readonly asOf: Date;
}

type ScheduleRow = Omit<ScheduleEvent, 'accessMode'> & { enrollmentStatus: EnrollmentStatus };

/**
 * Personal timetable: sessions of every class the principal can currently view (ACTIVE
 * enrollment → FULL, unexpired pending CASH hold → CASH_PREVIEW), never of cancelled classes.
 * Read-only; meeting URLs stay behind the class detail endpoint.
 */
@Injectable()
export class MyScheduleService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async list(
    studentId: string,
    query: ScheduleQuery,
    now: Date = new Date(),
  ): Promise<SchedulePage> {
    return inReadSnapshot(this.dataSource, async (manager) => {
      if (query.classId !== undefined) {
        const canView = await joinViewableEnrollment(
          manager
            .getRepository(ClassEntity)
            .createQueryBuilder('class')
            .where('class.id = :classId', { classId: query.classId }),
          studentId,
          now,
        ).getExists();
        if (!canView) {
          throw new ScheduleClassAccessDeniedException();
        }
      }

      const sessions = this.sessionsQuery(manager, studentId, query, now);
      const total = await sessions.getCount();
      const rows =
        total === 0
          ? []
          : await sessions
              .select('session.id', 'sessionId')
              .addSelect('session.sessionNumber', 'sessionNumber')
              .addSelect('session.title', 'sessionTitle')
              .addSelect('session.status', 'sessionStatus')
              .addSelect('session.startsAt', 'startsAt')
              .addSelect('session.endsAt', 'endsAt')
              .addSelect('session.roomName', 'roomName')
              .addSelect('class.id', 'classId')
              .addSelect('class.code', 'classCode')
              .addSelect('class.name', 'className')
              .addSelect('class.status', 'classStatus')
              .addSelect('class.deliveryMode', 'deliveryMode')
              .addSelect('class.mentorId', 'mentorId')
              .addSelect('mentor.displayName', 'mentorName')
              .addSelect('course.id', 'courseId')
              .addSelect('course.title', 'courseTitle')
              .addSelect('classUnit.id', 'classUnitId')
              .addSelect('courseUnit.title', 'unitTitle')
              .addSelect('enrollment.id', 'enrollmentId')
              .addSelect('enrollment.status', 'enrollmentStatus')
              .orderBy('session.startsAt', 'ASC')
              .addOrderBy('session.id', 'ASC')
              .offset((query.page - 1) * query.pageSize)
              .limit(query.pageSize)
              .getRawMany<ScheduleRow>();
      return {
        items: rows.map(({ enrollmentStatus, ...event }) => ({
          ...event,
          accessMode:
            enrollmentStatus === EnrollmentStatus.ACTIVE
              ? LearningAccessMode.FULL
              : LearningAccessMode.CASH_PREVIEW,
        })),
        page: query.page,
        pageSize: query.pageSize,
        total,
        timeZone: this.config.getOrThrow<string>('APP_TIME_ZONE'),
        from: query.from,
        to: query.to,
        asOf: now,
      };
    });
  }

  private sessionsQuery(
    manager: EntityManager,
    studentId: string,
    query: ScheduleQuery,
    now: Date,
  ): SelectQueryBuilder<ClassSessionEntity> {
    const sessions = manager
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('session')
      .innerJoin(ClassUnitEntity, 'classUnit', 'classUnit.id = session.classUnitId')
      .innerJoin(ClassEntity, 'class', 'class.id = classUnit.classId')
      .innerJoin(CourseEntity, 'course', 'course.id = class.courseId')
      .innerJoin(CourseUnitEntity, 'courseUnit', 'courseUnit.id = classUnit.courseUnitId')
      .leftJoin(UserEntity, 'mentor', 'mentor.id = class.mentorId')
      // Overlap with [from, to): sessions ending exactly at `from` or starting at `to` are out.
      .where('session.startsAt < :to', { to: query.to })
      .andWhere('session.endsAt > :from', { from: query.from });
    joinViewableEnrollment(sessions, studentId, now);
    if (query.classId !== undefined) {
      sessions.andWhere('class.id = :classId', { classId: query.classId });
    }
    if (!query.includeCancelled) {
      sessions.andWhere('session.status <> :cancelledSession', {
        cancelledSession: SessionStatus.CANCELLED,
      });
    }

    return sessions;
  }
}

/**
 * Restricts a query that has a `class` alias to classes the student can view now. The partial
 * unique index on effective enrollments guarantees at most one matching enrollment per class,
 * so the join never duplicates rows. Must be applied after `where()`, which resets conditions.
 */
function joinViewableEnrollment<T extends object>(
  query: SelectQueryBuilder<T>,
  studentId: string,
  now: Date,
): SelectQueryBuilder<T> {
  return query
    .innerJoin(
      EnrollmentEntity,
      'enrollment',
      'enrollment.classId = class.id AND enrollment.studentId = :studentId',
      { studentId },
    )
    .innerJoin(
      OrderDetailEntity,
      'detail',
      'detail.id = enrollment.orderDetailId AND detail.classId = enrollment.classId',
    )
    .innerJoin(
      OrderEntity,
      'purchase',
      'purchase.id = detail.orderId AND purchase.studentId = enrollment.studentId',
    )
    .andWhere('class.status <> :cancelledClass', { cancelledClass: ClassStatus.CANCELLED })
    .andWhere(
      `(enrollment.status = :activeStatus OR (
        enrollment.status = :pendingStatus AND purchase.paymentType = :cashPayment
        AND purchase.status = :pendingOrder AND purchase.expiresAt > :now
      ))`,
      {
        activeStatus: EnrollmentStatus.ACTIVE,
        pendingStatus: EnrollmentStatus.PENDING_PAYMENT,
        cashPayment: PaymentType.CASH,
        pendingOrder: OrderStatus.PENDING,
        now,
      },
    );
}
