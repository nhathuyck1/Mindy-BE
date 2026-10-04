import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager, In } from 'typeorm';

import { isUniqueViolation } from '../../../common/database/postgres-error.js';
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
  constructor(private readonly dataSource: DataSource) {}

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
