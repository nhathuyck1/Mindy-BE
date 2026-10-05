import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager, In } from 'typeorm';

// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { CoursesService } from '../../catalog/services/courses.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import { isClassOpenForPurchase } from '../domain/class-lifecycle.js';
import { ClassEntity } from '../entities/class.entity.js';
import { ClassUnitEntity } from '../entities/class-unit.entity.js';
import { ClassStatus } from '../enums/class-status.enum.js';
import type { DeliveryMode } from '../enums/delivery-mode.enum.js';
import {
  ClassFullException,
  ClassNotFoundException,
  ClassNotOpenException,
} from '../exceptions/class.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassReadService } from './class-read.service.js';

/** What a purchase workflow needs to know about a class in order to sell it. */
export interface ClassOffer {
  readonly classId: string;
  readonly code: string;
  readonly name: string;
  readonly status: ClassStatus;
  readonly deliveryMode: DeliveryMode;
  readonly startDate: string;
  readonly endDate: string;
  readonly mentorId: string;
  readonly maxStudents: number;
  readonly courseId: string;
  readonly courseTitle: string;
  /** Current course price in integer VND. */
  readonly priceAmount: number;
  readonly isPurchasable: boolean;
}

/**
 * Public API of the classes module for purchase workflows: selling information, class row
 * locks and the open/capacity/duplicate checks.
 */
@Injectable()
export class ClassOffersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly coursesService: CoursesService,
    private readonly enrollmentsService: EnrollmentsService,
    private readonly readService: ClassReadService,
  ) {}

  async unitIds(manager: EntityManager, classId: string): Promise<string[]> {
    const units = await manager
      .getRepository(ClassUnitEntity)
      .find({ where: { classId }, order: { position: 'ASC' }, select: { id: true } });
    return units.map((unit) => unit.id);
  }

  /** Reads offers without locking; unknown classes are omitted. */
  async findOffers(
    classIds: readonly string[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ClassOffer[]> {
    if (classIds.length === 0) {
      return [];
    }

    const classes = await manager.getRepository(ClassEntity).find({
      where: { id: In([...classIds]) },
      order: { id: 'ASC' },
    });
    return this.toOffers(manager, classes);
  }

  /** Offer of a class students may see; unknown and DRAFT classes read as not found. */
  async getVisibleOffer(classId: string): Promise<ClassOffer> {
    const [offer] = await this.findOffers([classId]);
    if (offer === undefined || offer.status === ClassStatus.DRAFT) {
      throw new ClassNotFoundException();
    }

    return offer;
  }

  /**
   * Locks the class rows in ascending ID order, so concurrent checkouts serialize on capacity
   * without deadlocking, then returns their offers read under the lock.
   */
  async lockOffers(manager: EntityManager, classIds: readonly string[]): Promise<ClassOffer[]> {
    const uniqueIds = [...new Set(classIds)].sort();
    const classes = await manager
      .getRepository(ClassEntity)
      .createQueryBuilder('class')
      .setLock('pessimistic_write')
      .where('class.id IN (:...classIds)', { classIds: uniqueIds })
      .orderBy('class.id', 'ASC')
      .getMany();
    if (classes.length !== uniqueIds.length) {
      throw new ClassNotFoundException();
    }

    return this.toOffers(manager, classes);
  }

  /**
   * Rejects the purchase when any class is not open, the student already holds a seat or is
   * enrolled, or the class is full. Callers that must not oversell pass the manager of the
   * transaction that holds the class locks.
   */
  async assertPurchasable(
    studentId: string,
    offers: readonly ClassOffer[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    const closed = offers.find((offer) => !offer.isPurchasable);
    if (closed !== undefined) {
      throw new ClassNotOpenException(closed.classId);
    }

    const classIds = offers.map((offer) => offer.classId);
    await this.enrollmentsService.assertNotEnrolled(studentId, classIds, manager);
    const occupied = await this.enrollmentsService.countOccupiedSeats(classIds, manager);
    const full = offers.find((offer) => (occupied.get(offer.classId) ?? 0) >= offer.maxStudents);
    if (full !== undefined) {
      throw new ClassFullException(full.classId);
    }
  }

  private async toOffers(
    manager: EntityManager,
    classes: readonly ClassEntity[],
  ): Promise<ClassOffer[]> {
    const courses = await this.coursesService.findByIds(
      [...new Set(classes.map((classEntity) => classEntity.courseId))],
      manager,
    );
    const today = this.readService.today();

    return classes.flatMap((classEntity) => {
      const course = courses.get(classEntity.courseId);
      if (course === undefined) {
        return [];
      }

      return [
        {
          classId: classEntity.id,
          code: classEntity.code,
          name: classEntity.name,
          status: classEntity.status,
          deliveryMode: classEntity.deliveryMode,
          startDate: classEntity.startDate,
          endDate: classEntity.endDate,
          mentorId: classEntity.mentorId,
          maxStudents: classEntity.maxStudents,
          courseId: course.id,
          courseTitle: course.title,
          priceAmount: course.priceAmount,
          isPurchasable: course.isActive && isClassOpenForPurchase(classEntity, today),
        },
      ];
    });
  }
}
