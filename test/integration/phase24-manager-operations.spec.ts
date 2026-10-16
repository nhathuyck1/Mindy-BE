import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CoursesService } from '../../src/modules/catalog/services/courses.service.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { OrdersService } from '../../src/modules/commerce/services/orders.service.js';
import { EnrollmentEntity } from '../../src/modules/enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../src/modules/enrollments/enums/enrollment-status.enum.js';
import {
  ManagerClassQueryDto,
  ManagerMentorClassesQueryDto,
  ManagerMentorScheduleQueryDto,
  ManagerOrdersQueryDto,
  ManagerPaymentsQueryDto,
  ManagerPeopleQueryDto,
  ManagerStudentClassesQueryDto,
  MentorAssignment,
  PaymentDateField,
} from '../../src/modules/manager-operations/dtos/manager-query.dto.js';
import { ManagerOperationsService } from '../../src/modules/manager-operations/services/manager-operations.service.js';
import { ManagerRosterStudentDto } from '../../src/modules/payments/dtos/manager-class-roster.dto.js';
import { MentorRosterStudentDto } from '../../src/modules/payments/dtos/mentor-class-roster.dto.js';
import { PaymentTransactionEntity } from '../../src/modules/payments/entities/payment-transaction.entity.js';
import { PaymentWebhookEventEntity } from '../../src/modules/payments/entities/payment-webhook-event.entity.js';
import { PaymentStatus } from '../../src/modules/payments/enums/payment-status.enum.js';
import { ManagerPaymentReadService } from '../../src/modules/payments/services/manager-payment-read.service.js';
import { MentorClassRosterService } from '../../src/modules/payments/services/mentor-class-roster.service.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { UserEntity } from '../../src/modules/users/user.entity.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { UserStatus } from '../../src/modules/users/user-status.enum.js';
import { paymentDatabase, paymentFixture } from '../helpers/payment-fixture.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'Phase 2.4 manager read projections + PostgreSQL',
  () => {
    let db: DataSource;
    let f: ReturnType<typeof paymentFixture>;
    let service: ManagerOperationsService;
    beforeAll(async () => {
      db = await paymentDatabase('manager_operations');
      f = paymentFixture(db);
      service = new ManagerOperationsService(
        db,
        f.users,
        f.read,
        new TeachingReadService(db, f.config, f.users, new ScheduleReservationsService()),
        new CoursesService(db),
        f.enrollments,
        new OrdersService(db),
        new ManagerPaymentReadService(),
      );
    }, 30000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });
    it('filters class before pagination, counts enrollment states and paginates unit metadata', async () => {
      const data = await f.order({ count: 2 });
      const c = await db.getRepository(ClassEntity).findOneByOrFail({ id: data.classIds[0] });
      await db.getRepository(ClassEntity).update(c.id, { name: 'literal %_ class' });
      const options = Object.assign(new ManagerClassQueryDto(), {
        courseId: c.courseId,
        mentorId: data.mentor.id,
        deliveryMode: c.deliveryMode,
        status: c.status,
        q: '%_',
        pageSize: 1,
      });
      const list = await service.listClasses(options);
      expect(list.total).toBe(1);
      expect(list.items[0]?.id).toBe(c.id);
      const detail = await service.classDetail(c.id);
      expect(detail).toMatchObject({
        unitCount: 2,
        sessionCount: 1,
        enrollmentCounts: { PENDING_PAYMENT: 1, ACTIVE: 0, COMPLETED: 0, CANCELLED: 0 },
      });
      const units = await service.units(c.id, { page: 2, pageSize: 1 });
      expect(units.total).toBe(2);
      expect(units.items[0]?.position).toBe(2);
      expect(JSON.stringify(detail)).not.toMatch(/meetingUrl|passwordHash|contentHtml/);
    });
    it('role-scopes directories and relationships including suspended targets, with literal search', async () => {
      const student = await f.user();
      const admin = await f.user(UserRole.ADMIN);
      await db
        .getRepository(UserEntity)
        .update(student.id, { displayName: 'User %_ exact', status: UserStatus.SUSPENDED });
      const list = await service.people(
        UserRole.STUDENT,
        Object.assign(new ManagerPeopleQueryDto(), { q: '%_', status: UserStatus.SUSPENDED }),
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.id).toBe(student.id);
      expect(await service.person(student.id, UserRole.STUDENT)).toMatchObject({
        status: 'SUSPENDED',
      });
      for (const role of [UserRole.STUDENT, UserRole.MENTOR] as const)
        await expect(service.person(admin.id, role)).rejects.toMatchObject({
          response: { code: 'USER_NOT_FOUND' },
        });
      await expect(
        service.studentClasses(admin.id, new ManagerStudentClassesQueryDto()),
      ).rejects.toBeDefined();
      await expect(
        service.mentorClasses(student.id, new ManagerMentorClassesQueryDto()),
      ).rejects.toBeDefined();
      expect(JSON.stringify(list)).not.toMatch(/passwordHash|session|token/i);
    });
    it('uses effective mentor for substitute schedule, overlap boundaries and class deduplication', async () => {
      const data = await f.order();
      const substitute = await f.user(UserRole.MENTOR);
      const units = await service.units(data.classIds[0] ?? '', { page: 1, pageSize: 20 });
      const session = await db
        .getRepository(ClassSessionEntity)
        .findOneByOrFail({ classUnitId: units.items[0]?.id });
      await db
        .getRepository(ClassSessionEntity)
        .update(session.id, { mentorOverrideId: substitute.id });
      const options = Object.assign(new ManagerMentorScheduleQueryDto(), {
        from: new Date(session.startsAt.getTime() + 1000).toISOString(),
        to: new Date(session.endsAt.getTime() + 1000).toISOString(),
      });
      expect((await service.mentorSchedule(substitute.id, options)).items[0]).toMatchObject({
        sessionId: session.id,
        assignmentType: 'SUBSTITUTE',
        effectiveMentor: { id: substitute.id },
      });
      expect((await service.mentorSchedule(data.mentor.id, options)).total).toBe(0);
      expect(
        (await service.mentorClasses(substitute.id, new ManagerMentorClassesQueryDto())).items[0],
      ).toMatchObject({ id: data.classIds[0], assignmentType: 'SUBSTITUTE' });
      expect(
        (
          await service.mentorSchedule(substitute.id, {
            ...options,
            assignment: MentorAssignment.PRIMARY,
          })
        ).total,
      ).toBe(0);
      expect(
        (
          await service.mentorSchedule(substitute.id, {
            ...options,
            from: session.endsAt.toISOString(),
            to: new Date(session.endsAt.getTime() + 3600000).toISOString(),
          })
        ).total,
      ).toBe(0);
      await db.query("UPDATE class_sessions SET status='CANCELLED' WHERE id=$1", [session.id]);
      const cancelled = await service.mentorSchedule(substitute.id, options);
      expect(cancelled.items[0]).toMatchObject({
        sessionId: session.id,
        status: 'CANCELLED',
        effectiveMentor: { id: substitute.id },
        assignmentType: 'SUBSTITUTE',
      });
    });
    it('keeps cancelled enrollment history and new registrations as separate rows without entitlement', async () => {
      const data = await f.order();
      const classId = data.classIds[0] ?? '';
      await db
        .getRepository(EnrollmentEntity)
        .update({ studentId: data.student.id }, { status: EnrollmentStatus.CANCELLED });
      const history = await service.studentClasses(
        data.student.id,
        new ManagerStudentClassesQueryDto(),
      );
      expect(history.total).toBe(1);
      expect(history.items[0]).toMatchObject({
        enrollmentStatus: 'CANCELLED',
        class: { id: classId },
        orderId: data.order.id,
      });
      expect(history.items[0]).not.toHaveProperty('accessMode');
      await expect(f.read.getStudentForManagement(classId, data.student.id)).rejects.toBeDefined();
      await f.cart.addItem(data.student.id, classId);
      await f.checkout.checkout(data.student.id, PaymentType.PAYOS);
      const rebought = await service.studentClasses(
        data.student.id,
        new ManagerStudentClassesQueryDto(),
      );
      expect(rebought.total).toBe(2);
      expect(new Set(rebought.items.map((e) => e.enrollmentId)).size).toBe(2);
      expect(rebought.items.map((e) => e.enrollmentStatus).sort()).toEqual([
        'CANCELLED',
        'PENDING_PAYMENT',
      ]);

      expect(
        (await f.read.getStudentForManagement(classId, data.student.id)).enrollment.status,
      ).toBe(EnrollmentStatus.PENDING_PAYMENT);
    });
    it('does not multiply multi-class orders; absent payment stays null, finance GET causes no writes', async () => {
      const data = await f.order({ count: 2 });
      const options = Object.assign(new ManagerOrdersQueryDto(), {
        studentId: data.student.id,
        classId: data.classIds[0],
        paymentType: PaymentType.PAYOS,
      });
      expect(await service.listOrders(options)).toMatchObject({
        total: 1,
        items: [{ id: data.order.id, totalAmount: data.order.totalAmount, payment: null }],
      });
      const detail = await service.orderDetail(data.order.id);
      expect(detail.details).toHaveLength(2);
      expect(detail.payment).toBeNull();
      expect(f.provider.creates).toBe(0);
      expect(await db.getRepository(PaymentTransactionEntity).count()).toBe(0);
      expect((await service.listPayments(new ManagerPaymentsQueryDto())).total).toBe(0);
    });
    it('projects CASH collector from recorded provenance across role changes, supports legacy references', async () => {
      const data = await f.order({ paymentType: PaymentType.CASH });
      const manager = await f.user(UserRole.MANAGER);
      await f.cash.confirm(manager.id, data.order.id, data.order.totalAmount);
      await db.getRepository(UserEntity).update(manager.id, { role: UserRole.STUDENT });
      const payment = (await service.orderDetail(data.order.id)).payment;
      expect(payment?.confirmedBy).toMatchObject({ id: manager.id, source: 'MANAGER' });
      expect(
        (
          await service.listPayments(
            Object.assign(new ManagerPaymentsQueryDto(), {
              classId: data.classIds[0],
              dateField: PaymentDateField.PAID_AT,
            }),
          )
        ).items.some((p) => p.id === payment?.id),
      ).toBe(true);
      if (!payment) throw new Error('Missing cash payment');
      await db
        .getRepository(PaymentTransactionEntity)
        .update(payment.id, { referenceCode: `cash:${data.mentor.id}:${data.order.id}` });
      expect((await service.paymentDetail(payment.id)).confirmedBy).toMatchObject({
        id: data.mentor.id,
        source: 'LEGACY_MENTOR',
      });
      await db
        .getRepository(PaymentTransactionEntity)
        .update(payment.id, { referenceCode: 'unrecognized' });
      expect((await service.paymentDetail(payment.id)).confirmedBy).toBeNull();
    });
    it('exposes only safe review metadata and existing provider code without remote reconciliation', async () => {
      const data = await f.order();
      await f.links.create(data.student.id, data.order.id);
      const p = await db
        .getRepository(PaymentTransactionEntity)
        .findOneByOrFail({ orderId: data.order.id });
      await db
        .getRepository(PaymentTransactionEntity)
        .update(p.id, { status: PaymentStatus.REQUIRES_REVIEW });
      await db.getRepository(PaymentWebhookEventEntity).save({
        eventKey: randomUUID(),
        fingerprint: 'secret',
        paymentId: p.id,
        providerOrderCode: 42,
        referenceCode: 'bank-private',
        paymentLinkId: 'private',
        amount: p.amount,
        currency: 'VND',
        resultCode: '00',
        source: 'WEBHOOK',
        outcome: 'REQUIRES_REVIEW',
        reason: 'AMOUNT_OR_METHOD_MISMATCH',
      });
      const detail = await service.paymentDetail(p.id);
      expect(detail.review).toEqual({
        outcome: 'REQUIRES_REVIEW',
        reason: 'AMOUNT_OR_METHOD_MISMATCH',
      });
      expect(detail.providerOrderCode).toBeTypeOf('number');
      expect(JSON.stringify(detail)).not.toMatch(
        /secret|bank-private|channelKey|leaseToken|checkoutUrl|qrCode/,
      );
      expect(f.provider.creates).toBe(1);
    });
    it('adds contact only to manager roster and preserves cash fields', async () => {
      const data = await f.order({ paymentType: PaymentType.CASH });
      const roster = new MentorClassRosterService(db, f.read);
      const rows = await roster.students(undefined, data.classIds[0] ?? '', {
        page: 1,
        pageSize: 20,
      });
      const row = rows.items[0];
      if (!row) throw new Error('Missing roster row');
      expect(new ManagerRosterStudentDto(row)).toMatchObject({
        email: data.student.email,
        canConfirmCash: true,
        orderId: data.order.id,
        classAmount: data.order.totalAmount,
      });
      expect(new MentorRosterStudentDto(row)).not.toHaveProperty('email');
      expect(new MentorRosterStudentDto(row)).not.toHaveProperty('phone');
    });
    it('keeps order query counts bounded across page sizes and records a local EXPLAIN', async () => {
      const log = vi.spyOn(db.logger, 'logQuery');
      const options = Object.assign(new ManagerOrdersQueryDto(), {
        paymentType: PaymentType.PAYOS,
        pageSize: 1,
      });
      await service.listOrders(options);
      const small = log.mock.calls.length;
      log.mockClear();
      await service.listOrders({ ...options, pageSize: 100 });
      expect(log.mock.calls.length).toBeLessThanOrEqual(small);
      expect(small).toBeLessThanOrEqual(12);
      const call = log.mock.calls.find(
        ([sql]) => sql.startsWith('SELECT') && sql.includes('FROM "orders"'),
      );
      if (!call) throw new Error('Order SQL was not captured');
      const plan: { 'QUERY PLAN': { 'Execution Time': number }[] }[] = await db.query(
        `EXPLAIN(ANALYZE, BUFFERS, FORMAT JSON) ${call[0]}`,
        call[1],
      );
      expect(plan[0]?.['QUERY PLAN'][0]?.['Execution Time']).toBeTypeOf('number');
      console.log('Phase2.4 local query evidence', {
        queriesPerOrderPage: small,
        executionMs: plan[0]?.['QUERY PLAN'][0]?.['Execution Time'],
        fixture: 'small isolated test data; not a production benchmark',
      });
      log.mockRestore();
    });
  },
);
