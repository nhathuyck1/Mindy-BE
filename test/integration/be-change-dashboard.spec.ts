import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service.js';
import { PayosPaymentDetailEntity } from '../../src/modules/payments/entities/payos-payment-detail.entity.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('be_dashboard'))(
  'Role dashboards with settled PostgreSQL orders',
  () => {
    let db: DataSource, f: ReturnType<typeof paymentFixture>, service: DashboardService;
    beforeAll(async () => {
      db = await paymentDatabase('be_dashboard');
      f = paymentFixture(db);
      service = new DashboardService(db);
    }, 30_000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });
    it('counts a multi-class CASH order once, allocates snapshots, and separates PAYOS and pending', async () => {
      const manager = await f.user(UserRole.MANAGER);
      const actor = { userId: manager.id, role: UserRole.MANAGER, sessionId: randomUUID() };
      const cash = await f.order({ count: 2, amount: 7000, paymentType: PaymentType.CASH });
      await f.cash.confirm(manager.id, cash.order.id, cash.order.totalAmount);
      const payos = await f.order({ amount: 11000 });
      const link = await f.links.create(payos.student.id, payos.order.id);
      const detail = await db
        .getRepository(PayosPaymentDetailEntity)
        .findOneByOrFail({ paymentId: link.paymentId });
      await f.settlement.settle(
        {
          orderCode: detail.providerOrderCode,
          amount: link.amount,
          paymentLinkId: detail.paymentLinkId ?? '',
          currency: 'VND',
          reference: randomUUID(),
          code: '00',
          isConfirmSample: false,
        },
        'WEBHOOK',
        null,
      );
      await f.order({ amount: 13000, paymentType: PaymentType.CASH });
      const expired = await f.order({ amount: 17000, paymentType: PaymentType.CASH });
      await db.query(
        "UPDATE orders SET created_at=clock_timestamp()-interval '1 day',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [expired.order.id],
      );
      // Reporting must use immutable sale snapshots even after catalogue price changes.
      await db.query('UPDATE courses SET price_amount=999999');
      const result = await service.manager(actor, 30);
      expect(result.summary).toEqual({
        collectedAmount: '25000',
        paidOrders: 2,
        pendingAmount: '13000',
        pendingOrders: 1,
      });
      expect(result.paymentMethods).toEqual([
        { id: 'CASH', name: 'CASH', amount: '14000', orders: 1 },
        { id: 'PAYOS', name: 'PAYOS', amount: '11000', orders: 1 },
      ]);
      expect(result.courses.map((x) => x.amount).sort()).toEqual(['11000', '14000']);
      expect(result.classes.map((x) => x.amount).sort()).toEqual(['11000', '7000', '7000']);
      expect(result.trend.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(25000);
      await expect(service.manager({ ...actor, role: UserRole.MENTOR }, 30)).rejects.toMatchObject({
        status: 403,
      });
    });
    it('attributes history to the recorded teacher and future sessions to the override, without financial data', async () => {
      const a = await f.order({ maxStudents: 3, paymentType: PaymentType.CASH });
      const substitute = await f.user(UserRole.MENTOR),
        replacement = await f.user(UserRole.MENTOR);
      const session = (await f.read.getDetail(a.classIds[0] ?? '')).units[0]?.sessions[0];
      if (!session) throw new Error('Missing session');
      const actor = { userId: substitute.id, role: UserRole.MENTOR, sessionId: randomUUID() };
      await db.query("UPDATE enrollments SET status='ACTIVE' WHERE class_id=$1", [a.classIds[0]]);
      await db.query('UPDATE class_sessions SET mentor_override_id=$2 WHERE id=$1', [
        session.id,
        substitute.id,
      ]);
      let result = await service.mentor(actor, 30);
      expect(result.upcoming.map((s) => s.sessionId)).toEqual([session.id]);
      expect(result.summary.students).toBe(1);
      expect(result.summary.primaryClasses).toBe(0);
      await db.query(
        "UPDATE class_sessions SET status='COMPLETED', teaching_mentor_id=$2, starts_at=clock_timestamp()-interval '2 hours', ends_at=clock_timestamp()-interval '1 hour', actual_started_at=clock_timestamp()-interval '2 hours', actual_ended_at=clock_timestamp()-interval '30 minutes' WHERE id=$1",
        [session.id, substitute.id],
      );
      await db.query('UPDATE classes SET mentor_id=$2 WHERE id=$1', [
        a.classIds[0],
        replacement.id,
      ]);
      result = await service.mentor(actor, 30);
      expect(result.summary).toMatchObject({
        assignedSessions: 1,
        substituteSessions: 1,
        completedSessions: 1,
        actualTeachingHours: 1.5,
        students: 1,
      });
      expect(result.upcoming).toEqual([]);
      expect(Object.keys(result).sort()).toEqual([
        'from',
        'generatedAt',
        'leaveRequests',
        'scope',
        'summary',
        'timeZone',
        'to',
        'upcoming',
      ]);
      const former = await service.mentor({ ...actor, userId: a.mentor.id }, 30);
      expect(former.summary.assignedSessions).toBe(0);
      expect(former.summary.students).toBe(0);
      // A historical primary teacher does not become a substitute after class reassignment.
      await db.query(
        'UPDATE class_sessions SET mentor_override_id=NULL,teaching_mentor_id=$2 WHERE id=$1',
        [session.id, a.mentor.id],
      );
      const historicalPrimary = await service.mentor({ ...actor, userId: a.mentor.id }, 30);
      expect(historicalPrimary.summary).toMatchObject({
        assignedSessions: 1,
        substituteSessions: 0,
        completedSessions: 1,
      });
      await expect(service.mentor({ ...actor, role: UserRole.MANAGER }, 30)).rejects.toMatchObject({
        status: 403,
      });
    });
  },
);
