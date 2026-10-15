import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager, In } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/postgres-error.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ScheduleReservationsService } from '../../schedule-reservations/schedule-reservations.service.js';
import { ClassUnitProgressEntity } from '../entities/class-unit-progress.entity.js';
import {
  EFFECTIVE_ENROLLMENT_STATUSES,
  EnrollmentEntity,
  SEAT_HOLDING_ENROLLMENT_STATUSES,
} from '../entities/enrollment.entity.js';
import { EnrollmentStatus } from '../enums/enrollment-status.enum.js';
import { ClassAlreadyEnrolledException } from '../exceptions/enrollment.exceptions.js';

export interface SeatHoldRequest {
  readonly classId: string;
  readonly orderDetailId: string;
}

/**
 * Owns enrollments: a student's entitlement to a class. A PENDING_PAYMENT enrollment is the
 * seat hold created by checkout. Methods that take part in a workflow transaction accept its
 * EntityManager.
 */
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reservations: ScheduleReservationsService,
  ) {}

  /** Current roster includes pending, active and completed registrations, not cancelled history. */
  async listForClass(
    classId: string,
    page: { readonly page: number; readonly pageSize: number },
  ): Promise<{ items: EnrollmentEntity[]; total: number }> {
    const [items, total] = await this.dataSource.getRepository(EnrollmentEntity).findAndCount({
      where: { classId, status: In([...EFFECTIVE_ENROLLMENT_STATUSES]) },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    });
    return { items, total };
  }

  async findEffectiveForClassStudent(
    classId: string,
    studentId: string,
  ): Promise<EnrollmentEntity | null> {
    return this.dataSource.getRepository(EnrollmentEntity).findOneBy({
      classId,
      studentId,
      status: In([...EFFECTIVE_ENROLLMENT_STATUSES]),
    });
  }

  /** Historical metadata only. Caller holds Class -> Session; no payment locks. */
  async attendanceHistory(
    manager: EntityManager,
    ids: readonly string[],
  ): Promise<EnrollmentEntity[]> {
    return ids.length ? manager.getRepository(EnrollmentEntity).findBy({ id: In([...ids]) }) : [];
  }

  /** Read committed entitlement only; attendance never acquires payment/enrollment locks. */
  async attendanceCandidates(
    manager: EntityManager,
    classId: string,
    cutoff: Date,
    allowCashAdmission: boolean,
  ): Promise<{ id: string; studentId: string }[]> {
    return manager.query(
      `SELECT e.id, e.student_id AS "studentId" FROM enrollments e
      WHERE e.class_id=$1 AND e.status='ACTIVE' AND e.created_at <= $2
      AND (e.enrolled_at <= $2 OR ($3 AND EXISTS (
        SELECT 1 FROM order_details d JOIN orders o ON o.id=d.order_id
        WHERE d.id=e.order_detail_id AND o.payment_type='CASH' AND o.status='PAID')))
      ORDER BY e.id`,
      [classId, cutoff, allowCashAdmission],
    );
  }

  async pendingAttendanceCount(
    manager: EntityManager,
    classId: string,
    now: Date,
  ): Promise<number> {
    const rows: { count: string }[] = await manager.query(
      `SELECT count(*) FROM enrollments e
      JOIN order_details d ON d.id=e.order_detail_id JOIN orders o ON o.id=d.order_id
      WHERE e.class_id=$1 AND e.status='PENDING_PAYMENT' AND o.payment_type='CASH'
        AND o.status='PENDING' AND o.expires_at > $2`,
      [classId, now],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async attendanceStudents(
    manager: EntityManager,
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const rows = ids.length
      ? await manager.getRepository(EnrollmentEntity).findBy({ id: In([...ids]) })
      : [];
    return new Map(rows.map((e) => [e.id, e.studentId]));
  }

  /** The seat hold created for this exact order detail, if it is still pending. */
  async findPendingHold(
    studentId: string,
    classId: string,
    orderDetailId: string,
  ): Promise<EnrollmentEntity | null> {
    return this.dataSource
      .getRepository(EnrollmentEntity)
      .findOneBy({ studentId, classId, orderDetailId, status: EnrollmentStatus.PENDING_PAYMENT });
  }

  /** The student's ACTIVE enrollment in the class; at most one exists (partial unique index). */
  async findActive(
    studentId: string,
    classId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<EnrollmentEntity | null> {
    return manager
      .getRepository(EnrollmentEntity)
      .findOneBy({ studentId, classId, status: EnrollmentStatus.ACTIVE });
  }

  /** Boolean entitlement check used by material policy; joins the caller's transaction. */
  async hasActiveAccess(
    studentId: string,
    classId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<boolean> {
    return manager
      .getRepository(EnrollmentEntity)
      .existsBy({ studentId, classId, status: EnrollmentStatus.ACTIVE });
  }

  async canActivateHolds(
    manager: EntityManager,
    studentId: string,
    holds: readonly { classId: string; orderDetailId: string; unitIds: readonly string[] }[],
  ): Promise<boolean> {
    if (holds.length === 0 || holds.some((h) => h.unitIds.length === 0)) return false;
    const rows = await manager
      .getRepository(EnrollmentEntity)
      .findBy({ orderDetailId: In(holds.map((h) => h.orderDetailId)) });
    return (
      rows.length === holds.length &&
      rows.every(
        (row) =>
          row.studentId === studentId &&
          row.status === EnrollmentStatus.PENDING_PAYMENT &&
          holds.some((h) => h.orderDetailId === row.orderDetailId && h.classId === row.classId),
      )
    );
  }

  /** Caller holds class/order locks. Missing, released or mismatched holds never grant access. */
  async activateHolds(
    manager: EntityManager,
    studentId: string,
    holds: readonly { classId: string; orderDetailId: string; unitIds: readonly string[] }[],
    now: Date,
  ): Promise<void> {
    await this.reservations.lockStudents(manager, [studentId]);
    const rows = await manager
      .getRepository(EnrollmentEntity)
      .createQueryBuilder('enrollment')
      .setLock('pessimistic_write')
      .where('enrollment.orderDetailId IN (:...ids)', { ids: holds.map((h) => h.orderDetailId) })
      .orderBy('enrollment.id', 'ASC')
      .getMany();
    if (
      rows.length !== holds.length ||
      holds.some((h) => h.unitIds.length === 0) ||
      rows.some(
        (row) =>
          row.studentId !== studentId ||
          row.status !== EnrollmentStatus.PENDING_PAYMENT ||
          !holds.some((h) => h.orderDetailId === row.orderDetailId && h.classId === row.classId),
      )
    ) {
      throw new Error('PAYMENT_HOLD_INVARIANT');
    }
    for (const row of rows) {
      const hold = holds.find((h) => h.orderDetailId === row.orderDetailId);
      if (!hold) throw new Error('PAYMENT_HOLD_INVARIANT');
      await manager
        .getRepository(EnrollmentEntity)
        .update(row.id, { status: EnrollmentStatus.ACTIVE, enrolledAt: now });
      await manager
        .getRepository(ClassUnitProgressEntity)
        .insert(hold.unitIds.map((classUnitId) => ({ enrollmentId: row.id, classUnitId })));
    }
    await this.reservations.recordMakeupConflicts(manager, [studentId], new Date());
  }

  /** Seats taken per class: pending holds plus active enrollments. */
  async countOccupiedSeats(
    classIds: readonly string[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<string, number>> {
    if (classIds.length === 0) {
      return new Map();
    }

    const rows = await manager
      .getRepository(EnrollmentEntity)
      .createQueryBuilder('enrollment')
      .select('enrollment.classId', 'classId')
      .addSelect('COUNT(*)', 'seats')
      .where('enrollment.classId IN (:...classIds)', { classIds: [...classIds] })
      .andWhere('enrollment.status IN (:...statuses)', {
        statuses: SEAT_HOLDING_ENROLLMENT_STATUSES,
      })
      .groupBy('enrollment.classId')
      .getRawMany<{ classId: string; seats: string }>();
    return new Map(rows.map((row) => [row.classId, Number(row.seats)]));
  }

  /** Rejects when the student already holds a seat or is enrolled in any of the classes. */
  async assertNotEnrolled(
    studentId: string,
    classIds: readonly string[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    if (classIds.length === 0) {
      return;
    }

    const enrollments = await manager.getRepository(EnrollmentEntity).find({
      select: { classId: true },
      where: {
        studentId,
        classId: In([...classIds]),
        status: In([...EFFECTIVE_ENROLLMENT_STATUSES]),
      },
      order: { classId: 'ASC' },
    });
    if (enrollments.length > 0) {
      throw new ClassAlreadyEnrolledException(enrollments.map((enrollment) => enrollment.classId));
    }
  }

  /** Creates the PENDING_PAYMENT enrollments that reserve seats for a new order. */
  async holdSeats(
    manager: EntityManager,
    studentId: string,
    holds: readonly SeatHoldRequest[],
  ): Promise<void> {
    await this.reservations.lockStudents(manager, [studentId]);
    try {
      await manager.getRepository(EnrollmentEntity).insert(
        holds.map((hold) => ({
          studentId,
          classId: hold.classId,
          orderDetailId: hold.orderDetailId,
          status: EnrollmentStatus.PENDING_PAYMENT,
          enrolledAt: null,
        })),
      );
      await this.reservations.recordMakeupConflicts(manager, [studentId], new Date());
    } catch (error: unknown) {
      // The partial unique index is the final defense against concurrent duplicate purchases.
      if (isUniqueViolation(error, 'uq_enrollments_student_class_effective')) {
        throw new ClassAlreadyEnrolledException();
      }

      throw error;
    }
  }

  /** Cancels holds that were never paid; repeating the call changes nothing. */
  async releaseHolds(manager: EntityManager, orderDetailIds: readonly string[]): Promise<number> {
    if (orderDetailIds.length === 0) {
      return 0;
    }

    const result = await manager
      .getRepository(EnrollmentEntity)
      .update(
        { orderDetailId: In([...orderDetailIds]), status: EnrollmentStatus.PENDING_PAYMENT },
        { status: EnrollmentStatus.CANCELLED },
      );
    return result.affected ?? 0;
  }
}
