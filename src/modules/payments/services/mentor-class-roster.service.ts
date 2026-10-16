import { HttpStatus, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI requires a runtime constructor.
import { DataSource, type EntityManager, In } from 'typeorm';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import { ClassEntity } from '../../classes/entities/class.entity.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
// biome-ignore lint/style/useImportType: Nest DI requires a runtime constructor.
import { ClassReadService } from '../../classes/services/class-read.service.js';
import { OrderEntity } from '../../commerce/entities/order.entity.js';
import { OrderDetailEntity } from '../../commerce/entities/order-detail.entity.js';
import { OrderStatus } from '../../commerce/enums/order-status.enum.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import {
  EFFECTIVE_ENROLLMENT_STATUSES,
  EnrollmentEntity,
} from '../../enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../enrollments/enums/enrollment-status.enum.js';
import { UserEntity } from '../../users/user.entity.js';
import type { UserStatus } from '../../users/user-status.enum.js';
import type {
  MentorClassPageOptionsDto,
  MentorRosterPageOptionsDto,
  MentorRosterRow,
} from '../dtos/mentor-class-roster.dto.js';

@Injectable()
export class MentorClassRosterService {
  constructor(
    private readonly db: DataSource,
    private readonly classRead: ClassReadService,
  ) {}

  /** Manager-only routes pass undefined; mentor routes always scope to their principal ID. */
  async classes(mentorId: string | undefined, options: MentorClassPageOptionsDto) {
    const query = this.db
      .getRepository(ClassEntity)
      .createQueryBuilder('class')
      .orderBy('class.createdAt', 'DESC')
      .addOrderBy('class.id', 'ASC');
    if (mentorId !== undefined) query.andWhere('class.mentorId = :mentorId', { mentorId });
    if (options.status !== undefined)
      query.andWhere('class.status = :status', { status: options.status });
    const [classes, total] = await query
      .skip((options.page - 1) * options.pageSize)
      .take(options.pageSize)
      .getManyAndCount();
    return { items: await this.classRead.toViews(classes), total };
  }

  async students(
    mentorId: string | undefined,
    classId: string,
    options: MentorRosterPageOptionsDto,
    manager: EntityManager = this.db.manager,
  ): Promise<{
    items: (MentorRosterRow & { email: string; phone: string | null; studentStatus: UserStatus })[];
    total: number;
  }> {
    const classEntity = await manager
      .getRepository(ClassEntity)
      .findOneBy(mentorId === undefined ? { id: classId } : { id: classId, mentorId });
    if (!classEntity)
      throw new AppHttpException(HttpStatus.NOT_FOUND, 'CLASS_NOT_FOUND', 'Class not found');

    const query = manager
      .getRepository(EnrollmentEntity)
      .createQueryBuilder('enrollment')
      .innerJoin(OrderDetailEntity, 'detail', 'detail.id = enrollment.orderDetailId')
      .innerJoin(OrderEntity, 'purchase', 'purchase.id = detail.orderId')
      .where('enrollment.classId = :classId', { classId })
      .andWhere('enrollment.status IN (:...statuses)', {
        statuses: EFFECTIVE_ENROLLMENT_STATUSES,
      })
      .orderBy('enrollment.createdAt', 'DESC')
      .addOrderBy('enrollment.id', 'ASC');
    if (options.paymentType !== undefined)
      query.andWhere('purchase.paymentType = :paymentType', {
        paymentType: options.paymentType,
      });
    if (options.orderStatus !== undefined)
      query.andWhere('purchase.status = :orderStatus', { orderStatus: options.orderStatus });

    const [enrollments, total] = await query
      .skip((options.page - 1) * options.pageSize)
      .take(options.pageSize)
      .getManyAndCount();
    if (enrollments.length === 0) return { items: [], total };

    const details = await manager.getRepository(OrderDetailEntity).find({
      where: { id: In(enrollments.map((e) => e.orderDetailId)) },
    });
    const detailById = new Map(details.map((d) => [d.id, d]));
    const orderIds = [...new Set(details.map((d) => d.orderId))];
    const [orders, students, allOrderDetails] = await Promise.all([
      manager.getRepository(OrderEntity).find({ where: { id: In(orderIds) } }),
      manager.getRepository(UserEntity).find({
        where: { id: In(enrollments.map((e) => e.studentId)) },
      }),
      manager.getRepository(OrderDetailEntity).find({ where: { orderId: In(orderIds) } }),
    ]);
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const studentById = new Map(students.map((s) => [s.id, s]));
    const countByOrder = new Map<string, number>();
    for (const detail of allOrderDetails)
      countByOrder.set(detail.orderId, (countByOrder.get(detail.orderId) ?? 0) + 1);
    const orderClasses = await manager.getRepository(ClassEntity).find({
      where: { id: In([...new Set(allOrderDetails.map((d) => d.classId))]) },
    });
    const classById = new Map(orderClasses.map((c) => [c.id, c]));
    const hasCancelledClass = new Set(
      allOrderDetails
        .filter((detail) => classById.get(detail.classId)?.status === ClassStatus.CANCELLED)
        .map((detail) => detail.orderId),
    );
    const now = new Date();

    const items = enrollments.map((enrollment) => {
      const detail = detailById.get(enrollment.orderDetailId);
      const order = detail && orderById.get(detail.orderId);
      const student = studentById.get(enrollment.studentId);
      if (!detail || !order || !student) throw new Error('Roster relationship is incomplete');
      return {
        enrollmentId: enrollment.id,
        enrollmentStatus: enrollment.status,
        studentId: enrollment.studentId,
        studentName: student.displayName,
        email: student.email,
        phone: student.phone,
        studentStatus: student.status,
        orderId: order.id,
        orderCode: order.orderCode,
        orderStatus: order.status,
        paymentType: order.paymentType,
        classAmount: detail.totalAmount,
        orderTotalAmount: order.totalAmount,
        orderClassCount: countByOrder.get(order.id) ?? 1,
        expiresAt: order.expiresAt,
        paidAt: order.paidAt,
        canConfirmCash:
          order.paymentType === PaymentType.CASH &&
          mentorId === undefined &&
          order.status === OrderStatus.PENDING &&
          order.expiresAt > now &&
          enrollment.status === EnrollmentStatus.PENDING_PAYMENT &&
          classEntity.status !== ClassStatus.CANCELLED &&
          !hasCancelledClass.has(order.id),
      };
    });
    return { items, total };
  }
}
