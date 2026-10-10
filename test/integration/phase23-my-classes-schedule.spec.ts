import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassStatus } from '../../src/modules/classes/enums/class-status.enum.js';
import { SessionStatus } from '../../src/modules/classes/enums/session-status.enum.js';
import { OrderStatus } from '../../src/modules/commerce/enums/order-status.enum.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { EnrollmentEntity } from '../../src/modules/enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../src/modules/enrollments/enums/enrollment-status.enum.js';
import { PaymentTransactionEntity } from '../../src/modules/payments/entities/payment-transaction.entity.js';
import { PaymentStatus } from '../../src/modules/payments/enums/payment-status.enum.js';
import { MyClassPageOptionsDto } from '../../src/modules/student-learning/dtos/my-class-page-options.dto.js';
import { LearningAccessMode } from '../../src/modules/student-learning/enums/learning-access-mode.enum.js';
import { LearningAccessReason } from '../../src/modules/student-learning/enums/learning-access-reason.enum.js';
import { MyClassView } from '../../src/modules/student-learning/enums/my-class-view.enum.js';
import { MyClassesService } from '../../src/modules/student-learning/services/my-classes.service.js';
import {
  MyScheduleService,
  type ScheduleQuery,
} from '../../src/modules/student-learning/services/my-schedule.service.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const HOUR = 3_600_000;

describe.skipIf(!separateTestUrl('learning'))(
  'Phase 2.3 My Classes + schedule (PostgreSQL)',
  () => {
    let db: DataSource;
    let f: ReturnType<typeof paymentFixture>;
    let myClasses: MyClassesService;
    let schedule: MyScheduleService;
    beforeAll(async () => {
      db = await paymentDatabase('learning');
      f = paymentFixture(db);
      myClasses = new MyClassesService(db);
      schedule = new MyScheduleService(db, f.config);
    }, 30000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });

    const options = (overrides: Partial<MyClassPageOptionsDto> = {}): MyClassPageOptionsDto =>
      Object.assign(new MyClassPageOptionsDto(), overrides);
    async function firstSession(classId: string): Promise<ClassSessionEntity> {
      const session = (await f.read.getDetail(classId)).units[0]?.sessions[0];
      if (!session) throw new Error('Missing session');
      return session;
    }
    /** A week-long range around the class's first session. */
    async function weekOf(classId: string, extra: Partial<ScheduleQuery> = {}) {
      const session = await firstSession(classId);
      return {
        session,
        query: {
          from: new Date(session.startsAt.getTime() - 72 * HOUR),
          to: new Date(session.startsAt.getTime() + 72 * HOUR),
          page: 1,
          pageSize: 100,
          includeCancelled: true,
          ...extra,
        } satisfies ScheduleQuery,
      };
    }

    it('lists a pending PayOS hold as current without private access or calendar events', async () => {
      const o = await f.order({ paymentType: PaymentType.PAYOS });
      const classId = o.classIds[0] ?? '';
      const page = await myClasses.list(o.student.id, options());
      expect(page.total).toBe(1);
      expect(page.items[0]).toMatchObject({
        classId,
        enrollmentStatus: EnrollmentStatus.PENDING_PAYMENT,
        order: {
          orderId: o.order.id,
          orderStatus: OrderStatus.PENDING,
          paymentType: PaymentType.PAYOS,
          requiresReview: false,
        },
        access: {
          mode: LearningAccessMode.NONE,
          reason: LearningAccessReason.PENDING_PAYOS,
          isHoldExpired: false,
        },
      });

      const { query } = await weekOf(classId);
      expect((await schedule.list(o.student.id, query)).total).toBe(0);
      await expect(schedule.list(o.student.id, { ...query, classId })).rejects.toMatchObject({
        status: 403,
      });

      await f.links.create(o.student.id, o.order.id);
      await db
        .getRepository(PaymentTransactionEntity)
        .update({ orderId: o.order.id }, { status: PaymentStatus.REQUIRES_REVIEW });
      expect((await myClasses.list(o.student.id, options())).items[0]?.order).toMatchObject({
        requiresReview: true,
      });
    });

    it('moves CASH preview to FULL after mentor confirmation, consistently with detail endpoints', async () => {
      const o = await f.order({ paymentType: PaymentType.CASH });
      const classId = o.classIds[0] ?? '';
      const pending = (await myClasses.list(o.student.id, options())).items[0];
      expect(pending?.access).toMatchObject({
        mode: LearningAccessMode.CASH_PREVIEW,
        reason: LearningAccessReason.PENDING_CASH,
      });
      const preview = await f.cash.preview(o.student.id, classId);
      expect(preview.enrollment.id).toBe(pending?.enrollmentId);
      expect(preview.order).toMatchObject({ id: o.order.id, orderCode: o.order.orderCode });
      await expect(f.access.get(o.student.id, classId)).rejects.toMatchObject({ status: 403 });

      const { session, query } = await weekOf(classId);
      const previewEvents = await schedule.list(o.student.id, { ...query, classId });
      expect(previewEvents).toMatchObject({ total: 1, timeZone: 'Asia/Ho_Chi_Minh' });
      expect(previewEvents.items[0]).toMatchObject({
        sessionId: session.id,
        enrollmentId: pending?.enrollmentId,
        accessMode: LearningAccessMode.CASH_PREVIEW,
        unitTitle: 'Unit one',
      });
      expect(JSON.stringify(previewEvents)).not.toContain('meet.example.test');

      await f.cash.confirm(o.mentor.id, o.order.id, o.order.totalAmount);
      const active = (await myClasses.list(o.student.id, options())).items[0];
      expect(active).toMatchObject({
        enrollmentId: pending?.enrollmentId,
        enrollmentStatus: EnrollmentStatus.ACTIVE,
        order: { orderStatus: OrderStatus.PAID },
        access: { mode: LearningAccessMode.FULL, reason: LearningAccessReason.ACTIVE_ENROLLMENT },
      });
      expect((await f.access.get(o.student.id, classId)).enrollment.id).toBe(active?.enrollmentId);
      await expect(f.cash.preview(o.student.id, classId)).rejects.toMatchObject({ status: 403 });
      expect((await schedule.list(o.student.id, query)).items[0]?.accessMode).toBe(
        LearningAccessMode.FULL,
      );
    });

    it('classifies an overdue hold as history before the expiry job, then keeps both rows after rebuy', async () => {
      const o = await f.order({ paymentType: PaymentType.CASH });
      const classId = o.classIds[0] ?? '';
      const deadline = o.order.expiresAt;
      const { query } = await weekOf(classId);
      const justBefore = new Date(deadline.getTime() - 1);
      expect((await myClasses.list(o.student.id, options(), justBefore)).total).toBe(1);
      expect((await schedule.list(o.student.id, query, justBefore)).total).toBe(1);

      // Exactly at the deadline the hold no longer grants anything, though nothing was persisted.
      const current = await myClasses.list(o.student.id, options(), deadline);
      expect(current.total).toBe(0);
      const history = await myClasses.list(
        o.student.id,
        options({ view: MyClassView.HISTORY }),
        deadline,
      );
      expect(history.items[0]).toMatchObject({
        enrollmentStatus: EnrollmentStatus.PENDING_PAYMENT,
        order: { orderStatus: OrderStatus.PENDING },
        access: {
          mode: LearningAccessMode.NONE,
          reason: LearningAccessReason.HOLD_EXPIRED,
          isHoldExpired: true,
        },
      });
      expect((await schedule.list(o.student.id, query, deadline)).total).toBe(0);
      await expect(
        schedule.list(o.student.id, { ...query, classId }, deadline),
      ).rejects.toMatchObject({ status: 403 });

      await f.expiry.expireOverdueBatch(new Date(deadline.getTime() + 1), 100);
      await f.cart.addItem(o.student.id, classId);
      const [rebuy] = await f.checkout.checkout(o.student.id, PaymentType.CASH);

      const all = await myClasses.list(o.student.id, options({ view: MyClassView.ALL }));
      expect(all.total).toBe(2);
      expect(all.items.map((item) => item.classId)).toEqual([classId, classId]);
      expect(all.items[0]).toMatchObject({
        order: { orderId: rebuy?.order.id },
        access: { mode: LearningAccessMode.CASH_PREVIEW },
      });
      expect(all.items[1]).toMatchObject({
        enrollmentStatus: EnrollmentStatus.CANCELLED,
        order: { orderId: o.order.id, orderStatus: OrderStatus.EXPIRED },
        access: { reason: LearningAccessReason.ENROLLMENT_CANCELLED },
      });
      const events = await schedule.list(o.student.id, query);
      expect(events.total).toBe(1);
      expect(events.items[0]?.enrollmentId).toBe(all.items[0]?.enrollmentId);
    });

    it('isolates students, paginates before mapping and keeps one row per enrollment of a shared order', async () => {
      const o = await f.order({ paymentType: PaymentType.CASH, count: 3 });
      const other = await f.user();
      expect(await myClasses.list(other.id, options({ view: MyClassView.ALL }))).toMatchObject({
        items: [],
        total: 0,
      });
      const { query } = await weekOf(o.classIds[0] ?? '');
      await expect(
        schedule.list(other.id, { ...query, classId: o.classIds[0] ?? '' }),
      ).rejects.toMatchObject({ status: 403 });

      const all = await myClasses.list(o.student.id, options());
      expect(all.total).toBe(3);
      expect(new Set(all.items.map((item) => item.order?.orderId))).toEqual(new Set([o.order.id]));
      const pages = await Promise.all(
        [1, 2, 3].map((page) => myClasses.list(o.student.id, options({ page, pageSize: 1 }))),
      );
      expect(pages.map((p) => p.total)).toEqual([3, 3, 3]);
      expect(pages.map((p) => p.items[0]?.enrollmentId)).toEqual(
        all.items.map((item) => item.enrollmentId),
      );

      expect(
        (await myClasses.list(o.student.id, options({ classStatus: ClassStatus.IN_PROGRESS })))
          .total,
      ).toBe(0);
      expect(
        (
          await myClasses.list(
            o.student.id,
            options({ view: MyClassView.HISTORY, enrollmentStatus: EnrollmentStatus.ACTIVE }),
          )
        ).total,
      ).toBe(0);
      const course = (
        await db.getRepository(ClassEntity).findOneByOrFail({ id: o.classIds[0] ?? '' })
      ).courseId;
      expect((await myClasses.list(o.student.id, options({ courseId: course }))).total).toBe(3);
    });

    it('keeps a cancelled class and a completed enrollment as summaries without calendar events', async () => {
      const o = await f.order({ paymentType: PaymentType.CASH, count: 2 });
      await f.cash.confirm(o.mentor.id, o.order.id, o.order.totalAmount);
      const [cancelledId = '', completedId = ''] = o.classIds;
      await db.getRepository(ClassEntity).update(cancelledId, { status: ClassStatus.CANCELLED });
      await db
        .getRepository(EnrollmentEntity)
        .update(
          { studentId: o.student.id, classId: completedId },
          { status: EnrollmentStatus.COMPLETED },
        );

      const items = (await myClasses.list(o.student.id, options())).items;
      expect(items.find((item) => item.classId === cancelledId)?.access).toMatchObject({
        mode: LearningAccessMode.NONE,
        reason: LearningAccessReason.CLASS_CANCELLED,
      });
      expect(items.find((item) => item.classId === completedId)?.access).toMatchObject({
        mode: LearningAccessMode.NONE,
        reason: LearningAccessReason.ENROLLMENT_COMPLETED,
      });
      for (const classId of o.classIds) {
        const { query } = await weekOf(classId);
        expect((await schedule.list(o.student.id, query)).total).toBe(0);
      }
      await expect(f.access.get(o.student.id, cancelledId)).rejects.toMatchObject({ status: 403 });
    });

    it('selects sessions overlapping [from, to), including overnight and cancelled sessions', async () => {
      const o = await f.order({ paymentType: PaymentType.CASH });
      const classId = o.classIds[0] ?? '';
      const { session, query } = await weekOf(classId);
      const sessions = db.getRepository(ClassSessionEntity);
      const overnight = await sessions.save(
        sessions.create({
          classUnitId: session.classUnitId,
          sessionNumber: 2,
          title: 'Overnight',
          startsAt: new Date(session.startsAt.getTime() + 15 * HOUR),
          endsAt: new Date(session.startsAt.getTime() + 18 * HOUR),
          roomName: null,
          meetingUrl: 'https://meet.example.test/private-session',
          status: SessionStatus.CANCELLED,
        }),
      );
      const at = (offsetHours: number) => new Date(session.startsAt.getTime() + offsetHours * HOUR);
      const ids = async (from: Date, to: Date, extra: Partial<ScheduleQuery> = {}) =>
        (await schedule.list(o.student.id, { ...query, from, to, ...extra })).items.map(
          (event) => event.sessionId,
        );

      expect(await ids(query.from, query.to)).toEqual([session.id, overnight.id]);
      expect(await ids(query.from, query.to, { includeCancelled: false })).toEqual([session.id]);
      // The first session is 08:00-09:00 (+07): ending at `from` or starting at `to` is excluded.
      expect(await ids(at(1), at(2))).toEqual([]);
      expect(await ids(at(-1), at(0))).toEqual([]);
      expect(await ids(at(0.5), at(0.6))).toEqual([session.id]);
      // An overnight session appears in the window of either calendar day it touches.
      expect(await ids(at(16), at(16.5))).toEqual([overnight.id]);
      expect(await ids(at(17.5), at(24))).toEqual([overnight.id]);

      const paged = await Promise.all(
        [1, 2].map((page) => schedule.list(o.student.id, { ...query, page, pageSize: 1 })),
      );
      expect(paged.map((p) => [p.total, p.items[0]?.sessionId])).toEqual([
        [2, session.id],
        [2, overnight.id],
      ]);
      expect(paged[1]?.items[0]).toMatchObject({ sessionStatus: SessionStatus.CANCELLED });
      expect(JSON.stringify(paged)).not.toContain('private-session');

      await sessions.update(session.id, { startsAt: at(2), endsAt: at(3) });
      expect(await ids(at(0.5), at(0.6))).toEqual([]);
      expect(await ids(at(2.5), at(2.6))).toEqual([session.id]);
    });
  },
);
