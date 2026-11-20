import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CourseEntity } from '../../src/modules/catalog/entities/course.entity.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { OrderEntity } from '../../src/modules/commerce/entities/order.entity.js';
import { OrderStatus } from '../../src/modules/commerce/enums/order-status.enum.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { ClassUnitProgressEntity } from '../../src/modules/enrollments/entities/class-unit-progress.entity.js';
import { EnrollmentEntity } from '../../src/modules/enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../src/modules/enrollments/enums/enrollment-status.enum.js';
import { PaymentConfirmationEmailEntity } from '../../src/modules/payments/entities/payment-confirmation-email.entity.js';
import { PaymentTransactionEntity } from '../../src/modules/payments/entities/payment-transaction.entity.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('freecheckout'))('Free checkout (PostgreSQL)', () => {
  let db: DataSource;
  let f: ReturnType<typeof paymentFixture>;
  beforeAll(async () => {
    db = await paymentDatabase('freecheckout');
    f = paymentFixture(db);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it.each([PaymentType.PAYOS, PaymentType.CASH])(
    'confirms %s zero orders and grants class access without payment',
    async (paymentType) => {
      const result = await f.order({ amount: 0, count: 2, paymentType });
      expect(result.order).toMatchObject({ status: OrderStatus.PAID, totalAmount: 0, paymentType });
      expect(result.order.paidAt).toBeInstanceOf(Date);
      expect(
        await db.getRepository(OrderEntity).findOneByOrFail({ id: result.order.id }),
      ).toMatchObject({ status: OrderStatus.PAID, paidAt: result.order.paidAt });
      for (const classId of result.classIds) {
        const view = await f.access.get(result.student.id, classId);
        expect(view.enrollment.status).toBe(EnrollmentStatus.ACTIVE);
        expect(view.enrollment.enrolledAt).toEqual(result.order.paidAt);
        expect(
          await db
            .getRepository(ClassUnitProgressEntity)
            .countBy({ enrollmentId: view.enrollment.id }),
        ).toBe(2);
      }
      expect(
        await db.getRepository(PaymentTransactionEntity).countBy({ orderId: result.order.id }),
      ).toBe(0);
      expect(
        await db
          .getRepository(PaymentConfirmationEmailEntity)
          .countBy({ orderId: result.order.id }),
      ).toBe(0);
      await expect(f.links.create(result.student.id, result.order.id)).rejects.toThrow();
      expect(f.provider.creates).toBe(0);
      expect(await f.cart.getCart(result.student.id)).toEqual([]);
      await expect(f.checkout.checkout(result.student.id, paymentType)).rejects.toThrow();
      expect(await db.getRepository(OrderEntity).countBy({ studentId: result.student.id })).toBe(1);
    },
  );

  it('settles only zero CASH mentor groups while positive groups keep pending holds', async () => {
    const free = await f.order({ amount: 0, maxStudents: 3 });
    const paid = await f.order({ amount: 5000, maxStudents: 3 });
    const student = await f.user();
    for (const classId of [...free.classIds, ...paid.classIds])
      await f.cart.addItem(student.id, classId);
    const orders = await f.checkout.checkout(student.id, PaymentType.CASH);
    expect(orders).toHaveLength(2);
    expect(orders.map(({ order }) => [order.totalAmount, order.status]).sort()).toEqual([
      [0, OrderStatus.PAID],
      [5000, OrderStatus.PENDING],
    ]);
    const enrollments = await db.getRepository(EnrollmentEntity).findBy({ studentId: student.id });
    expect(enrollments.find((row) => row.classId === free.classIds[0])?.status).toBe(
      EnrollmentStatus.ACTIVE,
    );
    expect(enrollments.find((row) => row.classId === paid.classIds[0])?.status).toBe(
      EnrollmentStatus.PENDING_PAYMENT,
    );
    expect(f.provider.creates).toBe(0);
  });

  it('keeps a mixed PAYOS cart pending until the positive combined total is paid', async () => {
    const free = await f.order({ amount: 0, maxStudents: 3 });
    const paid = await f.order({ amount: 5000, maxStudents: 3 });
    const student = await f.user();
    for (const classId of [...free.classIds, ...paid.classIds])
      await f.cart.addItem(student.id, classId);
    const result = await f.checkout.checkout(student.id, PaymentType.PAYOS);
    expect(result).toHaveLength(1);
    expect(result[0]?.order).toMatchObject({
      totalAmount: 5000,
      status: OrderStatus.PENDING,
      paidAt: null,
    });
    expect(
      await db
        .getRepository(EnrollmentEntity)
        .countBy({ studentId: student.id, status: EnrollmentStatus.PENDING_PAYMENT }),
    ).toBe(2);
  });

  it.each([
    [0, 5000],
    [5000, 0],
  ])(
    'rechecks current price %i -> %i instead of trusting the snapshot',
    async (oldPrice, currentPrice) => {
      const prepared = await f.order({ amount: oldPrice, maxStudents: 3 });
      const classId = prepared.classIds[0];
      if (!classId) throw new Error('Missing fixture class');
      const student = await f.user();
      await f.cart.addItem(student.id, classId);
      const klass = await db.getRepository(ClassEntity).findOneByOrFail({ id: classId });
      await db.getRepository(CourseEntity).update(klass.courseId, { priceAmount: currentPrice });
      const [result] = await f.checkout.checkout(student.id, PaymentType.PAYOS);
      expect(result?.order.totalAmount).toBe(currentPrice);
      expect(result?.order.status).toBe(
        currentPrice === 0 ? OrderStatus.PAID : OrderStatus.PENDING,
      );
      expect(
        (await db.getRepository(EnrollmentEntity).findOneByOrFail({ studentId: student.id }))
          .status,
      ).toBe(currentPrice === 0 ? EnrollmentStatus.ACTIVE : EnrollmentStatus.PENDING_PAYMENT);
    },
  );

  it('rolls back orders, holds and progress and preserves the cart when activation fails', async () => {
    const prepared = await f.order({ amount: 0, maxStudents: 3 });
    const student = await f.user();
    const classId = prepared.classIds[0];
    if (!classId) throw new Error('Missing fixture class');
    await f.cart.addItem(student.id, classId);
    const activate = vi
      .spyOn(f.enrollments, 'activateHolds')
      .mockRejectedValueOnce(new Error('activation failure'));
    try {
      await expect(f.checkout.checkout(student.id, PaymentType.PAYOS)).rejects.toThrow(
        'activation failure',
      );
      expect(await db.getRepository(OrderEntity).countBy({ studentId: student.id })).toBe(0);
      expect(await db.getRepository(EnrollmentEntity).countBy({ studentId: student.id })).toBe(0);
      expect(await f.cart.getCart(student.id)).toHaveLength(1);
    } finally {
      activate.mockRestore();
    }
    const [result] = await f.checkout.checkout(student.id, PaymentType.PAYOS);
    expect(result?.order.status).toBe(OrderStatus.PAID);
  });

  it('serializes double submissions without duplicate enrollments or progress', async () => {
    const prepared = await f.order({ amount: 0, maxStudents: 3 });
    const student = await f.user();
    const classId = prepared.classIds[0];
    if (!classId) throw new Error('Missing fixture class');
    await f.cart.addItem(student.id, classId);
    const results = await Promise.allSettled([
      f.checkout.checkout(student.id, PaymentType.PAYOS),
      f.checkout.checkout(student.id, PaymentType.PAYOS),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await db.getRepository(OrderEntity).countBy({ studentId: student.id })).toBe(1);
    const enrollment = await db
      .getRepository(EnrollmentEntity)
      .findOneByOrFail({ studentId: student.id });
    expect(enrollment.status).toBe(EnrollmentStatus.ACTIVE);
    expect(
      await db.getRepository(ClassUnitProgressEntity).countBy({ enrollmentId: enrollment.id }),
    ).toBe(2);
  });
});
