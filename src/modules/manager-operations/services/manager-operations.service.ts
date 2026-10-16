import { HttpStatus, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager } from 'typeorm';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { CoursesService } from '../../catalog/services/courses.service.js';
import { MANAGEMENT_MENTOR_SQL } from '../../classes/domain/effective-mentor.js';
import { AdminClassStudentDetailDto } from '../../classes/dtos/admin-class-student.dto.js';
import { ClassNotFoundException } from '../../classes/exceptions/class.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ClassReadService } from '../../classes/services/class-read.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { TeachingReadService } from '../../classes/services/teaching-read.service.js';
import { OrderDto } from '../../commerce/dtos/order.dto.js';
import { PaymentType } from '../../commerce/enums/payment-type.enum.js';
import { OrderNotFoundException } from '../../commerce/exceptions/commerce.exceptions.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { OrdersService } from '../../commerce/services/orders.service.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import { isCashConfirmation } from '../../payments/domain/cash-confirmation.js';
import type { MentorClassPageDto } from '../../payments/dtos/mentor-class-roster.dto.js';
import { MentorClassDto } from '../../payments/dtos/mentor-class-roster.dto.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ManagerPaymentReadService } from '../../payments/services/manager-payment-read.service.js';
import { UserRole } from '../../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { UsersService } from '../../users/users.service.js';
import { literalSearch, managerRange, safeReviewReason } from '../domain/manager-read.js';
import type {
  ManagerClassQueryDto,
  ManagerMentorClassesQueryDto,
  ManagerMentorScheduleQueryDto,
  ManagerOrdersQueryDto,
  ManagerPaymentsQueryDto,
  ManagerPeopleQueryDto,
  ManagerStudentClassesQueryDto,
} from '../dtos/manager-query.dto.js';
import { MentorAssignment, PaymentDateField } from '../dtos/manager-query.dto.js';
import type {
  CashCollectorDto,
  ManagerClassDetailDto,
  ManagerMentorClassesPageDto,
  ManagerOrderDetailDto,
  ManagerOrderSummaryDto,
  ManagerOrdersPageDto,
  ManagerPaymentDto,
  ManagerPaymentsPageDto,
  ManagerPeoplePageDto,
  ManagerSchedulePageDto,
  ManagerStudentClassesPageDto,
  ManagerUnitsPageDto,
} from '../dtos/manager-response.dto.js';
import { ManagerPersonDto, managerPage } from '../dtos/manager-response.dto.js';

@Injectable()
export class ManagerOperationsService {
  constructor(
    private readonly db: DataSource,
    private readonly users: UsersService,
    private readonly classes: ClassReadService,
    private readonly teaching: TeachingReadService,
    private readonly courses: CoursesService,
    private readonly enrollments: EnrollmentsService,
    private readonly orders: OrdersService,
    private readonly payments: ManagerPaymentReadService,
  ) {}

  async classStudent(classId: string, studentId: string): Promise<AdminClassStudentDetailDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.users.findManagerPerson(studentId, UserRole.STUDENT, m);
      return new AdminClassStudentDetailDto(
        await this.classes.getStudentForManagement(classId, studentId, m),
      );
    });
  }

  async people(
    role: UserRole.MENTOR | UserRole.STUDENT,
    options: ManagerPeopleQueryDto,
  ): Promise<ManagerPeoplePageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const q = this.users.managerPeopleQuery(m, role);
      if (options.status !== undefined)
        q.andWhere('person.status = :status', { status: options.status });
      if (options.q !== undefined)
        q.andWhere(
          '(person.displayName ILIKE :search OR person.email ILIKE :search OR person.phone ILIKE :search)',
          { search: literalSearch(options.q) },
        );
      const [rows, total] = await q
        .orderBy('person.createdAt', 'DESC')
        .addOrderBy('person.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      return managerPage(
        rows.map((row) => new ManagerPersonDto(row)),
        total,
        options,
      );
    });
  }
  async person(id: string, role: UserRole.MENTOR | UserRole.STUDENT): Promise<ManagerPersonDto> {
    return this.db.transaction(
      'REPEATABLE READ',
      async (m) => new ManagerPersonDto(await this.users.findManagerPerson(id, role, m)),
    );
  }
  async listClasses(options: ManagerClassQueryDto): Promise<MentorClassPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const q = this.classes.managementQuery(m);
      if (options.courseId !== undefined)
        q.andWhere('c.courseId = :courseId', { courseId: options.courseId });
      if (options.mentorId !== undefined)
        q.andWhere('c.mentorId = :mentorId', { mentorId: options.mentorId });
      if (options.status !== undefined)
        q.andWhere('c.status = :status', { status: options.status });
      if (options.deliveryMode !== undefined)
        q.andWhere('c.deliveryMode = :mode', { mode: options.deliveryMode });
      if (options.q !== undefined)
        q.andWhere('(c.name ILIKE :search OR c.code ILIKE :search)', {
          search: literalSearch(options.q),
        });
      const [rows, total] = await q
        .orderBy('c.createdAt', 'DESC')
        .addOrderBy('c.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      return managerPage(
        (await this.classes.toViews(rows, m)).map((v) => new MentorClassDto(v)),
        total,
        options,
      );
    });
  }
  async classDetail(id: string): Promise<ManagerClassDetailDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const c = await this.teaching.loadClass(m, id);
      const course = (await this.courses.findByIds([c.courseId], m)).get(c.courseId);
      const view = (await this.classes.toViews([c], m))[0];
      if (!course || !view) throw new ClassNotFoundException();
      return {
        ...new MentorClassDto(view),
        course: { id: course.id, code: course.code, title: course.title },
        // Rooms are session-specific in the current schema, available in the timetable.
        roomName: null,
        unitCount: await this.classes
          .managementUnitsQuery(m)
          .where('unit.classId = :id', { id })
          .getCount(),
        sessionCount: await this.teaching.sessionQuery(m).where('c.id = :id', { id }).getCount(),
        enrollmentCounts: await this.enrollments.managementCounts(m, id),
      };
    });
  }
  async units(id: string, options: PageOptionsDto): Promise<ManagerUnitsPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.teaching.loadClass(m, id);
      const [rows, total] = await this.classes
        .managementUnitsQuery(m)
        .where('unit.classId = :id', { id })
        .orderBy('unit.position', 'ASC')
        .addOrderBy('unit.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      const titles = await this.courses.findUnitsByIds(
        rows.map((u) => u.courseUnitId),
        m,
      );
      return managerPage(
        rows.map((u) => ({
          id: u.id,
          courseUnitId: u.courseUnitId,
          title: titles.get(u.courseUnitId)?.title ?? '',
          position: u.position,
          status: u.status,
          unlockAt: u.unlockAt,
        })),
        total,
        options,
      );
    });
  }
  async mentorClasses(
    id: string,
    options: ManagerMentorClassesQueryDto,
  ): Promise<ManagerMentorClassesPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.users.findManagerPerson(id, UserRole.MENTOR, m);
      const related = this.teaching
        .sessionQuery(m)
        .select('c.id')
        .where(
          `${MANAGEMENT_MENTOR_SQL} = :target AND (s.mentorOverrideId IS NOT NULL OR s.teachingMentorId <> c.mentorId)`,
          { target: id },
        );
      const substitute = `c.id IN (${related.getQuery()})`;
      const q = this.classes.managementQuery(m).setParameters(related.getParameters());
      if (options.assignment === MentorAssignment.PRIMARY)
        q.where('c.mentorId = :target', { target: id });
      else if (options.assignment === MentorAssignment.SUBSTITUTE) q.where(substitute);
      else q.where(`(c.mentorId = :target OR ${substitute})`, { target: id });
      if (options.status !== undefined)
        q.andWhere('c.status = :status', { status: options.status });
      const [rows, total] = await q
        .orderBy('c.createdAt', 'DESC')
        .addOrderBy('c.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      // A class can have a current primary relationship and historical effective substitute sessions.
      const substitutes = rows.length
        ? await this.teaching
            .sessionQuery(m)
            .select('c.id', 'classId')
            .distinct(true)
            .where('c.id IN (:...ids)', { ids: rows.map((c) => c.id) })
            .andWhere(
              `${MANAGEMENT_MENTOR_SQL} = :target AND (s.mentorOverrideId IS NOT NULL OR s.teachingMentorId <> c.mentorId)`,
              { target: id },
            )
            .getRawMany<{ classId: string }>()
        : [];
      const substituteIds = new Set(substitutes.map((s) => s.classId));
      return managerPage(
        (await this.classes.toViews(rows, m)).map((v) => ({
          ...new MentorClassDto(v),
          assignmentType:
            v.classEntity.mentorId === id
              ? substituteIds.has(v.classEntity.id)
                ? ('BOTH' as const)
                : ('PRIMARY' as const)
              : ('SUBSTITUTE' as const),
        })),
        total,
        options,
      );
    });
  }
  async mentorSchedule(
    id: string,
    options: ManagerMentorScheduleQueryDto,
  ): Promise<ManagerSchedulePageDto> {
    const range = managerRange(options.from, options.to, 31);
    if (!range)
      throw new AppHttpException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'MANAGER_RANGE_INVALID',
        'Range required',
      );
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.users.findManagerPerson(id, UserRole.MENTOR, m);
      const q = this.teaching
        .sessionQuery(m)
        .where(`${MANAGEMENT_MENTOR_SQL} = :target`, { target: id })
        .andWhere('s.startsAt < :to AND s.endsAt > :from', range);
      if (options.assignment === MentorAssignment.PRIMARY)
        q.andWhere('c.mentorId = :target AND s.mentorOverrideId IS NULL');
      if (options.assignment === MentorAssignment.SUBSTITUTE)
        q.andWhere('(s.mentorOverrideId IS NOT NULL OR c.mentorId <> :target)');
      const [rows, total] = await q
        .orderBy('s.startsAt', 'ASC')
        .addOrderBy('s.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      const views = await this.teaching.sessionViews(m, rows, new Date());
      const classRows = rows.length
        ? await this.classes
            .managementQuery(m)
            .where('c.id IN (:...ids)', { ids: [...new Set(views.map((v) => v.classId))] })
            .getMany()
        : [];
      const mapped = views.map((view, index) => {
        const session = rows[index];
        const c = classRows.find((c) => c.id === view.classId);
        if (!session || !c) throw new ClassNotFoundException();
        const effective =
          view.effectiveMentor ??
          (session.status === 'CANCELLED' ? { id, displayName: null } : null);
        return {
          ...view,
          effectiveMentor: effective,
          assignmentType:
            session.mentorOverrideId !== null || effective?.id !== c.mentorId
              ? ('SUBSTITUTE' as const)
              : ('PRIMARY' as const),
        };
      });
      return {
        ...managerPage(mapped, total, options),
        ...range,
        timeZone: this.teaching.timeZone(),
      };
    });
  }
  async studentClasses(
    id: string,
    options: ManagerStudentClassesQueryDto,
  ): Promise<ManagerStudentClassesPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.users.findManagerPerson(id, UserRole.STUDENT, m);
      const classQuery = this.classes.managementQuery(m).select('c.id');
      if (options.classStatus !== undefined)
        classQuery.where('c.status = :classStatus', { classStatus: options.classStatus });
      const q = this.enrollments
        .managementQuery(m)
        .where('e.studentId = :studentId', { studentId: id })
        .andWhere(`e.classId IN (${classQuery.getQuery()})`)
        .setParameters(classQuery.getParameters());
      if (options.enrollmentStatus !== undefined)
        q.andWhere('e.status = :enrollmentStatus', { enrollmentStatus: options.enrollmentStatus });
      const [rows, total] = await q
        .orderBy('e.createdAt', 'DESC')
        .addOrderBy('e.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      if (!rows.length) return managerPage([], total, options);
      const classes = await this.classes
        .managementQuery(m)
        .where('c.id IN (:...ids)', { ids: rows.map((e) => e.classId) })
        .getMany();
      const orderQuery = this.orders.managementQuery(m, {
        studentId: id,
        orderDetailIds: rows.map((e) => e.orderDetailId),
      });
      const details = await this.orders.managementDetails(
        m,
        (await orderQuery.getMany()).map((o) => o.id),
      );
      const purchases = await this.orders
        .managementQuery(m)
        .where('purchase.id IN (:...ids)', { ids: [...new Set(details.map((d) => d.orderId))] })
        .getMany();
      return managerPage(
        rows.map((e) => {
          const c = classes.find((c) => c.id === e.classId);
          const d = details.find((d) => d.id === e.orderDetailId);
          const order = purchases.find((o) => o.id === d?.orderId);
          if (!c || !d || !order) throw new Error('Enrollment history relationship is incomplete');
          return {
            enrollmentId: e.id,
            enrollmentStatus: e.status,
            registeredAt: e.createdAt,
            enrolledAt: e.enrolledAt,
            class: { id: c.id, code: c.code, name: c.name, status: c.status, courseId: c.courseId },
            orderDetailId: d.id,
            orderId: order.id,
            orderStatus: order.status,
            paymentType: order.paymentType,
          };
        }),
        total,
        options,
      );
    });
  }
  async listOrders(options: ManagerOrdersQueryDto): Promise<ManagerOrdersPageDto> {
    const range = managerRange(options.from, options.to, 366);
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const q = this.orders.managementQuery(m, options);
      if (options.status !== undefined)
        q.andWhere('purchase.status = :status', { status: options.status });
      if (options.orderCode !== undefined)
        q.andWhere('purchase.orderCode = :orderCode', { orderCode: options.orderCode });
      if (range) q.andWhere('purchase.createdAt >= :from AND purchase.createdAt < :to', range);
      const [rows, total] = await q
        .orderBy('purchase.createdAt', 'DESC')
        .addOrderBy('purchase.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      return managerPage(await this.orderViews(m, rows), total, options);
    });
  }
  async orderDetail(id: string): Promise<ManagerOrderDetailDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const order = await this.orders
        .managementQuery(m)
        .where('purchase.id = :id', { id })
        .getOne();
      if (!order) throw new OrderNotFoundException();
      const summary = (await this.orderViews(m, [order]))[0];
      if (!summary) throw new OrderNotFoundException();
      return {
        ...new OrderDto({ order, details: await this.orders.managementDetails(m, [id]) }),
        student: summary.student,
        payment: summary.payment,
      };
    });
  }
  async listPayments(options: ManagerPaymentsQueryDto): Promise<ManagerPaymentsPageDto> {
    const range = managerRange(options.from, options.to, 366);
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const orders = this.orders.managementQuery(m, options).select('purchase.id');
      const q = this.payments
        .query(m)
        .where(`payment.orderId IN (${orders.getQuery()})`)
        .setParameters(orders.getParameters());
      if (options.orderId !== undefined)
        q.andWhere('payment.orderId = :orderId', { orderId: options.orderId });
      if (options.status !== undefined)
        q.andWhere('payment.status = :status', { status: options.status });
      const field =
        options.dateField === PaymentDateField.PAID_AT ? 'payment.paidAt' : 'payment.createdAt';
      if (options.dateField === PaymentDateField.PAID_AT) q.andWhere('payment.paidAt IS NOT NULL');
      if (range) q.andWhere(`${field} >= :from AND ${field} < :to`, range);
      const [rows, total] = await q
        .orderBy('payment.createdAt', 'DESC')
        .addOrderBy('payment.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      if (!rows.length) return managerPage([], total, options);
      const purchases = await this.orders
        .managementQuery(m)
        .where('purchase.id IN (:...ids)', { ids: rows.map((p) => p.orderId) })
        .getMany();
      const views = await this.orderViews(m, purchases);
      return managerPage(
        rows.map((p) => {
          const view = views.find((v) => v.id === p.orderId)?.payment;
          if (!view) throw new Error('Payment relationship is incomplete');
          return view;
        }),
        total,
        options,
      );
    });
  }
  async paymentDetail(id: string): Promise<ManagerPaymentDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const payment = await this.payments.query(m).where('payment.id = :id', { id }).getOne();
      if (!payment)
        throw new AppHttpException(HttpStatus.NOT_FOUND, 'PAYMENT_NOT_FOUND', 'Payment not found');
      const orders = await this.orders
        .managementQuery(m)
        .where('purchase.id = :id', { id: payment.orderId })
        .getMany();
      const view = (await this.orderViews(m, orders))[0]?.payment;
      if (!view)
        throw new AppHttpException(HttpStatus.NOT_FOUND, 'PAYMENT_NOT_FOUND', 'Payment not found');
      return view;
    });
  }
  private async orderViews(
    m: EntityManager,
    orders: Awaited<ReturnType<ReturnType<OrdersService['managementQuery']>['getMany']>>,
  ): Promise<ManagerOrderSummaryDto[]> {
    const projections = await this.payments.forOrders(
      m,
      orders.map((o) => o.id),
    );
    const collectorIds = projections.flatMap(({ payment }) => {
      const order = orders.find((o) => o.id === payment.orderId);
      return order &&
        order.paymentType === PaymentType.CASH &&
        isCashConfirmation(payment.referenceCode, order.id, order.cashMentorId)
        ? [payment.referenceCode?.split(':')[1] ?? '']
        : [];
    });
    const people = new Map(
      (
        await this.users.findByIds(
          [...new Set([...orders.map((o) => o.studentId), ...collectorIds])],
          m,
        )
      ).map((u) => [u.id, u]),
    );
    return orders.map((order) => {
      const projection = projections.find((p) => p.payment.orderId === order.id);
      const student = {
        id: order.studentId,
        displayName: people.get(order.studentId)?.displayName ?? null,
      };
      let confirmedBy: CashCollectorDto | null = null;
      if (
        order.paymentType === PaymentType.CASH &&
        projection &&
        isCashConfirmation(projection.payment.referenceCode, order.id, order.cashMentorId)
      ) {
        const actorId = projection.payment.referenceCode?.split(':')[1];
        if (actorId)
          confirmedBy = {
            id: actorId,
            displayName: people.get(actorId)?.displayName ?? null,
            source: projection.payment.referenceCode?.startsWith('cash-manager:')
              ? 'MANAGER'
              : 'LEGACY_MENTOR',
          };
      }
      return {
        id: order.id,
        orderCode: order.orderCode,
        status: order.status,
        paymentType: order.paymentType,
        totalAmount: order.totalAmount,
        expiresAt: order.expiresAt,
        paidAt: order.paidAt,
        createdAt: order.createdAt,
        student,
        payment: projection
          ? {
              id: projection.payment.id,
              orderId: order.id,
              amount: projection.payment.amount,
              status: projection.payment.status,
              paidAt: projection.payment.paidAt,
              createdAt: projection.payment.createdAt,
              referenceCode: projection.payment.referenceCode,
              providerOrderCode: projection.providerOrderCode,
              confirmedBy,
              review: projection.review
                ? { outcome: 'REQUIRES_REVIEW', reason: safeReviewReason(projection.review.reason) }
                : null,
              student,
              paymentType: order.paymentType,
              orderCode: order.orderCode,
              orderStatus: order.status,
            }
          : null,
      };
    });
  }
}
