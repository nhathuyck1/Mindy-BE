import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { OrderEntity } from '../../src/modules/commerce/entities/order.entity.js';
import { OrderStatus } from '../../src/modules/commerce/enums/order-status.enum.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { OrderCancellationService } from '../../src/modules/commerce/services/order-cancellation.service.js';
import { OrderSettlementService } from '../../src/modules/commerce/services/order-settlement.service.js';
import { EnrollmentEntity } from '../../src/modules/enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../src/modules/enrollments/enums/enrollment-status.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('cancellation'))('Student order cancellation (PostgreSQL)', () => {
  let db: DataSource;
  let f: ReturnType<typeof paymentFixture>;
  let cancellation: OrderCancellationService;
  beforeAll(async () => {
    db = await paymentDatabase('cancellation');
    f = paymentFixture(db);
    cancellation = new OrderCancellationService(
      db,
      new OrderSettlementService(),
      f.offers,
      f.enrollments,
    );
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  for (const paymentType of [PaymentType.PAYOS, PaymentType.CASH]) {
    it(`releases every ${paymentType} seat atomically and allows repeated cancellation`, async () => {
      const o = await f.order({ count: 2, paymentType });
      const results = await Promise.all([
        cancellation.cancel(o.student.id, o.order.id),
        cancellation.cancel(o.student.id, o.order.id),
      ]);
      expect(results.map((r) => r.order.status)).toEqual(['CANCELLED', 'CANCELLED']);
      const holds = await db.getRepository(EnrollmentEntity).findBy({ studentId: o.student.id });
      expect(holds).toHaveLength(2);
      expect(holds.every((hold) => hold.status === EnrollmentStatus.CANCELLED)).toBe(true);
      const nextStudent = await f.user();
      const classId = o.classIds[0];
      if (!classId) throw new Error('Missing class');
      await f.cart.addItem(nextStudent.id, classId);
      await expect(f.checkout.checkout(nextStudent.id, PaymentType.PAYOS)).resolves.toHaveLength(1);
    });
  }

  it('rejects missing/foreign/paid/expired orders without releasing holds', async () => {
    const o = await f.order();
    await expect(cancellation.cancel(randomUUID(), o.order.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(cancellation.cancel(o.student.id, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
    for (const status of [OrderStatus.PAID, OrderStatus.EXPIRED]) {
      await db.getRepository(OrderEntity).update(o.order.id, { status });
      await expect(cancellation.cancel(o.student.id, o.order.id)).rejects.toMatchObject({
        status: 409,
      });
    }
    await db.getRepository(OrderEntity).update(o.order.id, {
      status: OrderStatus.PENDING,
      createdAt: new Date(Date.now() - 3000),
      expiresAt: new Date(Date.now() - 2000),
    });
    await expect(cancellation.cancel(o.student.id, o.order.id)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      await db
        .getRepository(EnrollmentEntity)
        .countBy({ studentId: o.student.id, status: EnrollmentStatus.PENDING_PAYMENT }),
    ).toBe(1);
  });

  it('rolls back the order when releasing its holds fails', async () => {
    const o = await f.order();
    vi.spyOn(f.enrollments, 'releaseHolds').mockRejectedValueOnce(new Error('release failed'));
    await expect(cancellation.cancel(o.student.id, o.order.id)).rejects.toThrow('release failed');
    expect((await db.getRepository(OrderEntity).findOneByOrFail({ id: o.order.id })).status).toBe(
      'PENDING',
    );
  });

  it('serializes cancellation against payment and sends a late transfer to review', async () => {
    const o = await f.order();
    const payment = await f.links.create(o.student.id, o.order.id);
    if (payment.providerOrderCode === null) throw new Error('Missing provider code');
    const remote = await f.provider.get(payment.providerOrderCode);
    if (!remote) throw new Error('Missing payment link');
    const event = {
      orderCode: remote.orderCode,
      paymentLinkId: remote.id,
      amount: payment.amount,
      currency: 'VND',
      reference: randomUUID(),
      code: '00',
      isConfirmSample: false,
    };
    await cancellation.cancel(o.student.id, o.order.id);
    await expect(f.settlement.settle(event, 'WEBHOOK', null)).resolves.toBe('REQUIRES_REVIEW');
    expect((await db.getRepository(OrderEntity).findOneByOrFail({ id: o.order.id })).status).toBe(
      'CANCELLED',
    );

    const racing = await f.order();
    const p = await f.links.create(racing.student.id, racing.order.id);
    if (p.providerOrderCode === null) throw new Error('Missing provider code');
    const link = await f.provider.get(p.providerOrderCode);
    if (!link) throw new Error('Missing payment link');
    const results = await Promise.allSettled([
      cancellation.cancel(racing.student.id, racing.order.id),
      f.settlement.settle(
        { ...event, orderCode: link.orderCode, paymentLinkId: link.id, reference: randomUUID() },
        'WEBHOOK',
        null,
      ),
    ]);
    const saved = await db.getRepository(OrderEntity).findOneByOrFail({ id: racing.order.id });
    const enrollment = await db
      .getRepository(EnrollmentEntity)
      .findOneByOrFail({ studentId: racing.student.id });
    expect(['PAID', 'CANCELLED']).toContain(saved.status);
    expect(enrollment.status).toBe(
      saved.status === 'PAID' ? EnrollmentStatus.ACTIVE : EnrollmentStatus.CANCELLED,
    );
    expect(results[1].status).toBe('fulfilled');
    expect(results[0].status).toBe(saved.status === 'PAID' ? 'rejected' : 'fulfilled');
  });
});
