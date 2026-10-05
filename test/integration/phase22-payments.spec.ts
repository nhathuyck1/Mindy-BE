import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { APIError, PayOS } from '@payos/node';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassStatus } from '../../src/modules/classes/enums/class-status.enum.js';
import { OrderEntity } from '../../src/modules/commerce/entities/order.entity.js';
import { OrderStatus } from '../../src/modules/commerce/enums/order-status.enum.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { OrderSettlementService } from '../../src/modules/commerce/services/order-settlement.service.js';
import { ClassUnitProgressEntity } from '../../src/modules/enrollments/entities/class-unit-progress.entity.js';
import { EnrollmentEntity } from '../../src/modules/enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../src/modules/enrollments/enums/enrollment-status.enum.js';
import { EnrollmentsService } from '../../src/modules/enrollments/services/enrollments.service.js';
import { PayosAdapter } from '../../src/modules/payments/adapters/payos.adapter.js';
import type { VerifiedPayment } from '../../src/modules/payments/domain/payos-provider.js';
import { PaymentConfirmationEmailEntity } from '../../src/modules/payments/entities/payment-confirmation-email.entity.js';
import { PaymentTransactionEntity } from '../../src/modules/payments/entities/payment-transaction.entity.js';
import { PaymentWebhookEventEntity } from '../../src/modules/payments/entities/payment-webhook-event.entity.js';
import { PayosPaymentDetailEntity } from '../../src/modules/payments/entities/payos-payment-detail.entity.js';
import { PaymentStatus } from '../../src/modules/payments/enums/payment-status.enum.js';
import { PaymentEmailService } from '../../src/modules/payments/services/payment-email.service.js';
import { PaymentLinksService } from '../../src/modules/payments/services/payment-links.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import type { MailService } from '../../src/shared/mail/mail.service.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('payments'))('Phase 2.2 payment transactions (PostgreSQL)', () => {
  let db: DataSource;
  let f: ReturnType<typeof paymentFixture>;
  beforeAll(async () => {
    db = await paymentDatabase();
    f = paymentFixture(db);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function payable(count = 1) {
    const o = await f.order({ count });
    const payment = await f.links.create(o.student.id, o.order.id);
    const d = await db
      .getRepository(PayosPaymentDetailEntity)
      .findOneByOrFail({ paymentId: payment.paymentId });
    const event: VerifiedPayment = {
      orderCode: d.providerOrderCode,
      amount: payment.amount,
      paymentLinkId: d.paymentLinkId ?? '',
      currency: 'VND',
      reference: randomUUID(),
      code: '00',
      isConfirmSample: false,
    };
    return { ...o, payment, d, event };
  }
  const settle = (event: VerifiedPayment) => f.settlement.settle(event, 'WEBHOOK', null);

  it('creates and persists QR after actual-adapter GET returns observed 101, then reuses the same link', async () => {
    const o = await f.order();
    const config = new ConfigService({
      ...f.values,
      PAYOS_CLIENT_ID: 'test-client',
      PAYOS_API_KEY: 'test-key',
      PAYOS_CHECKSUM_KEY: 'test-checksum',
      PAYOS_RETURN_URL: 'https://example.test/paid',
      PAYOS_CANCEL_URL: 'https://example.test/cancel',
    });
    const adapter = new PayosAdapter(config);
    const links = new PaymentLinksService(db, new OrderSettlementService(), config, adapter);
    const spy = vi.spyOn(PayOS.prototype, 'request');
    spy.mockRejectedValueOnce(
      new APIError(
        200,
        { code: '101', desc: 'Mã thanh toán không tồn tại' },
        undefined,
        new Headers(),
      ),
    );
    spy.mockImplementationOnce(async () => {
      const p = await db
        .getRepository(PaymentTransactionEntity)
        .findOneByOrFail({ orderId: o.order.id });
      const d = await db
        .getRepository(PayosPaymentDetailEntity)
        .findOneByOrFail({ paymentId: p.id });
      return {
        paymentLinkId: 'test101link',
        orderCode: d.providerOrderCode,
        amount: o.order.totalAmount,
        currency: 'VND',
        status: 'PENDING',
        checkoutUrl: 'https://pay.payos.vn/web/test101link',
        qrCode: 'test-qr-payload',
      };
    });
    try {
      const payment = await links.create(o.student.id, o.order.id);
      expect(payment).toMatchObject({
        status: PaymentStatus.PENDING,
        qrCode: 'test-qr-payload',
        checkoutUrl: 'https://pay.payos.vn/web/test101link',
      });
      expect(spy.mock.calls[0]?.[0]).toMatchObject({ method: 'GET' });
      expect(spy.mock.calls[1]?.[0]).toMatchObject({ method: 'POST' });
      expect(await links.create(o.student.id, o.order.id)).toEqual(payment);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(
        await db.getRepository(PaymentTransactionEntity).countBy({ orderId: o.order.id }),
      ).toBe(1);
      expect(await paid(o.order.id)).toBe(OrderStatus.PENDING);
    } finally {
      spy.mockRestore();
    }
  });
  async function paid(id: string) {
    return (await db.getRepository(OrderEntity).findOneByOrFail({ id })).status;
  }

  it('migrates new tables up/down/up without dropping existing hold schema', async () => {
    await db.undoLastMigration();
    expect(await db.query("SELECT to_regclass('payment_transactions') AS name")).toEqual([
      { name: null },
    ]);
    expect(await db.query("SELECT to_regclass('enrollments') IS NOT NULL AS present")).toEqual([
      { present: true },
    ]);
    await db.runMigrations();
  });

  it('creates one attempt/link for parallel requests and reuses it on retries', async () => {
    const o = await f.order();
    const before = f.provider.creates;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => f.links.create(o.student.id, o.order.id)),
    );
    expect(new Set(results.map((r) => r.paymentId)).size).toBe(1);
    expect(f.provider.creates - before).toBe(1);
    const retry = await f.links.create(o.student.id, o.order.id);
    expect(retry.checkoutUrl).not.toBeNull();
    expect(await db.getRepository(PaymentTransactionEntity).countBy({ orderId: o.order.id })).toBe(
      1,
    );
  });

  it('resolves redirect codes for the owner even after settlement; rejects other owners and unknown codes', async () => {
    const o = await payable();
    expect(o.payment.providerOrderCode).toBe(o.d.providerOrderCode);
    expect(await f.links.resolveOrder(o.student.id, String(o.d.providerOrderCode))).toBe(
      o.order.id,
    );
    const other = await f.user();
    await expect(
      f.links.resolveOrder(other.id, String(o.d.providerOrderCode)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(f.links.resolveOrder(o.student.id, '9007199254740992')).rejects.toMatchObject({
      status: 404,
    });
    await expect(f.links.resolveOrder(o.student.id, '1')).rejects.toMatchObject({ status: 404 });
    await settle(o.event);
    expect(await f.links.resolveOrder(o.student.id, String(o.d.providerOrderCode))).toBe(
      o.order.id,
    );
  });

  it('confirms full cash atomically and idempotently with mentor audit and initializes all progress', async () => {
    const o = await f.order({ count: 2, paymentType: PaymentType.CASH });
    expect(await f.cash.preview(o.student.id, o.classIds[0] ?? '')).toBeDefined();
    const confirmations = await Promise.all(
      Array.from({ length: 3 }, () => f.cash.confirm(o.mentor.id, o.order.id, o.order.totalAmount)),
    );
    expect(confirmations.every((c) => c.order.status === OrderStatus.PAID)).toBe(true);
    expect(await db.getRepository(PaymentTransactionEntity).countBy({ orderId: o.order.id })).toBe(
      1,
    );
    const payment = await f.links.get(o.student.id, o.order.id);
    expect(payment).toMatchObject({
      status: PaymentStatus.SUCCEEDED,
      providerOrderCode: null,
      checkoutUrl: null,
    });
    const rows = await db.getRepository(EnrollmentEntity).findBy({ studentId: o.student.id });
    expect(rows.every((e) => e.status === EnrollmentStatus.ACTIVE)).toBe(true);
    for (const row of rows)
      expect(
        await db.getRepository(ClassUnitProgressEntity).countBy({ enrollmentId: row.id }),
      ).toBe(2);
    expect(
      await db.getRepository(PaymentConfirmationEmailEntity).countBy({ orderId: o.order.id }),
    ).toBe(0);
    await expect(f.cash.preview(o.student.id, o.classIds[0] ?? '')).rejects.toMatchObject({
      status: 403,
    });
    await expect(f.access.get(o.student.id, o.classIds[0] ?? '')).resolves.toBeDefined();
  });

  it('rejects cash wrong mentor, partial/extra amount, expired and cancelled classes without activation', async () => {
    const o = await f.order({ paymentType: PaymentType.CASH });
    const other = await f.user(UserRole.MENTOR);
    await expect(f.cash.confirm(other.id, o.order.id, o.order.totalAmount)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      f.cash.confirm(o.mentor.id, o.order.id, o.order.totalAmount - 1),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.cash.confirm(o.mentor.id, o.order.id, o.order.totalAmount + 1),
    ).rejects.toMatchObject({ status: 409 });
    await db
      .getRepository(ClassEntity)
      .update(o.classIds[0] ?? '', { status: ClassStatus.CANCELLED });
    await expect(
      f.cash.confirm(o.mentor.id, o.order.id, o.order.totalAmount),
    ).rejects.toMatchObject({ status: 409 });
    await expect(f.cash.preview(o.student.id, o.classIds[0] ?? '')).rejects.toMatchObject({
      status: 403,
    });
    await db.getRepository(ClassEntity).update(o.classIds[0] ?? '', { status: ClassStatus.OPEN });
    await db.getRepository(OrderEntity).update(o.order.id, {
      createdAt: new Date(Date.now() - 10000),
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      f.cash.confirm(o.mentor.id, o.order.id, o.order.totalAmount),
    ).rejects.toMatchObject({ status: 409 });
    expect(await paid(o.order.id)).toBe(OrderStatus.PENDING);
    await expect(f.cash.preview(o.student.id, o.classIds[0] ?? '')).rejects.toMatchObject({
      status: 403,
    });
    expect(await db.getRepository(PaymentTransactionEntity).countBy({ orderId: o.order.id })).toBe(
      0,
    );
  });

  it('rolls back cash payment and all activations on progress failure; retry recovers', async () => {
    const o = await f.order({ count: 2, paymentType: PaymentType.CASH });
    const activate = vi
      .spyOn(f.enrollments, 'activateHolds')
      .mockImplementationOnce(async (...args) => {
        await EnrollmentsService.prototype.activateHolds.apply(f.enrollments, args);
        throw new Error('progress failure');
      });
    await expect(f.cash.confirm(o.mentor.id, o.order.id, o.order.totalAmount)).rejects.toThrow(
      'progress failure',
    );
    activate.mockRestore();
    expect(await paid(o.order.id)).toBe(OrderStatus.PENDING);
    expect(await db.getRepository(PaymentTransactionEntity).countBy({ orderId: o.order.id })).toBe(
      0,
    );
    expect(
      (await db.getRepository(EnrollmentEntity).findBy({ studentId: o.student.id })).every(
        (e) => e.status === EnrollmentStatus.PENDING_PAYMENT,
      ),
    ).toBe(true);
    await expect(
      f.cash.confirm(o.mentor.id, o.order.id, o.order.totalAmount),
    ).resolves.toBeDefined();
  });

  it('recovers a lost provider response using the same code/attempt', async () => {
    const o = await f.order();
    f.provider.failAfterCreate = true;
    const before = f.provider.creates;
    await expect(f.links.create(o.student.id, o.order.id)).rejects.toThrow();
    const restored = await f.links.create(o.student.id, o.order.id);
    expect(restored.status).toBe(PaymentStatus.PENDING);
    expect(f.provider.creates - before).toBe(1);
  });

  it('settles multi-class holds atomically, with progress and one mail job', async () => {
    const p = await payable(2);
    await expect(f.access.get(p.student.id, p.classIds[0] ?? '')).rejects.toThrow();
    expect(await settle(p.event)).toBe('SETTLED');
    expect(await paid(p.order.id)).toBe(OrderStatus.PAID);
    const rows = await db.getRepository(EnrollmentEntity).findBy({ studentId: p.student.id });
    expect(rows.every((r) => r.status === EnrollmentStatus.ACTIVE)).toBe(true);
    expect(rows).toHaveLength(2);
    expect(
      await db.getRepository(ClassUnitProgressEntity).countBy({ enrollmentId: rows[0]?.id }),
    ).toBe(2);
    expect(
      await db.getRepository(PaymentConfirmationEmailEntity).countBy({ orderId: p.order.id }),
    ).toBe(1);
    expect(
      (await f.access.get(p.student.id, p.classIds[0] ?? '')).classEntity.meetingUrl,
    ).toContain('/private');
    const other = await f.user();
    await expect(f.access.get(other.id, p.classIds[0] ?? '')).rejects.toThrow();
  });

  it('sequential and concurrent duplicate callbacks do not duplicate side effects', async () => {
    const p = await payable();
    const result = await Promise.all([settle(p.event), settle(p.event), settle(p.event)]);
    expect(result.filter((r) => r === 'SETTLED')).toHaveLength(1);
    expect(await settle(p.event)).toBe('DUPLICATE');
    expect(
      await db.getRepository(PaymentConfirmationEmailEntity).countBy({ orderId: p.order.id }),
    ).toBe(1);
  });

  it('does not regress paid state when callback precedes create response persistence', async () => {
    const o = await f.order();
    f.provider.onCreate = async (link) => {
      expect(
        await settle({
          orderCode: link.orderCode,
          amount: link.amount,
          paymentLinkId: link.id,
          reference: randomUUID(),
          currency: 'VND',
          code: '00',
          isConfirmSample: false,
        }),
      ).toBe('SETTLED');
    };
    try {
      const link = await f.links.create(o.student.id, o.order.id);
      expect(link.status).toBe(PaymentStatus.SUCCEEDED);
      expect(link.checkoutUrl).toBeNull();
      expect(await paid(o.order.id)).toBe(OrderStatus.PAID);
    } finally {
      f.provider.onCreate = null;
    }
  });

  it.each(['amount', 'currency', 'paymentLinkId', 'code'] as const)(
    'persists %s mismatch for review, without poisoning a valid later payment',
    async (field) => {
      const p = await payable();
      const bad = {
        ...p.event,
        reference: randomUUID(),
        [field]: field === 'amount' ? p.event.amount + 1 : 'WRONG',
      };
      expect(await settle(bad)).toBe('REQUIRES_REVIEW');
      expect(await paid(p.order.id)).toBe(OrderStatus.PENDING);
      expect(await settle(p.event)).toBe('SETTLED');
    },
  );

  it('records collisions durably without downgrading a settled order', async () => {
    const p = await payable();
    await settle(p.event);
    expect(await settle({ ...p.event, amount: p.event.amount + 1 })).toBe('REQUIRES_REVIEW');
    expect(await settle({ ...p.event, amount: p.event.amount + 1 })).toBe('REQUIRES_REVIEW');
    expect(
      await db.getRepository(PaymentWebhookEventEntity).countBy({ paymentId: p.payment.paymentId }),
    ).toBe(2);
    expect(await paid(p.order.id)).toBe(OrderStatus.PAID);
  });

  it('records unknown signed order and acknowledges the full confirm sample without business rows', async () => {
    const base = {
      orderCode: 987,
      amount: 5000,
      paymentLinkId: randomUUID(),
      reference: randomUUID(),
      currency: 'VND',
      code: '00',
      isConfirmSample: false,
    };
    expect(await settle(base)).toBe('REQUIRES_REVIEW');
    expect(await settle({ ...base, reference: randomUUID(), isConfirmSample: true })).toBe(
      'CONFIRM_SAMPLE',
    );
  });

  it('late payment never reacquires released seats, even with a new last-seat buyer', async () => {
    const p = await payable();
    await db.getRepository(OrderEntity).update(p.order.id, { expiresAt: new Date(Date.now() - 1) });
    await f.expiry.expireOverdueBatch(new Date(), 100);
    const other = await f.user();
    await f.cart.addItem(other.id, p.classIds[0] ?? '');
    const [replacement] = await f.checkout.checkout(other.id, PaymentType.PAYOS);
    expect(replacement).toBeDefined();
    expect(await settle(p.event)).toBe('REQUIRES_REVIEW');
    expect(await paid(p.order.id)).toBe(OrderStatus.EXPIRED);
    expect(
      await db
        .getRepository(EnrollmentEntity)
        .countBy({ classId: p.classIds[0], status: EnrollmentStatus.ACTIVE }),
    ).toBe(0);
  });

  it('serializes webhook/expiry/checkout on a live last-seat hold without deadlock', async () => {
    const p = await payable();
    const other = await f.user();
    const results = await Promise.allSettled([
      settle(p.event),
      f.expiry.expireOverdueBatch(new Date(), 100),
      f.cart.addItem(other.id, p.classIds[0] ?? ''),
    ]);
    expect(results[0]?.status).toBe('fulfilled');
    expect(await paid(p.order.id)).toBe(OrderStatus.PAID);
    expect(results[2]?.status).toBe('rejected');
    expect(
      await db
        .getRepository(EnrollmentEntity)
        .countBy({ classId: p.classIds[0], status: EnrollmentStatus.ACTIVE }),
    ).toBe(1);
  });

  it('cancelled class and released hold are review-only', async () => {
    const p = await payable();
    await db
      .getRepository(ClassEntity)
      .update(p.classIds[0] ?? '', { status: ClassStatus.CANCELLED });
    expect(await settle(p.event)).toBe('REQUIRES_REVIEW');
    expect(await paid(p.order.id)).toBe(OrderStatus.PENDING);
    const q = await payable();
    await db
      .getRepository(EnrollmentEntity)
      .update({ studentId: q.student.id }, { status: EnrollmentStatus.CANCELLED });
    expect(await settle(q.event)).toBe('REQUIRES_REVIEW');
  });

  it('rolls back activation, payment, event and order when progress insertion fails', async () => {
    const p = await payable(2);
    const spy = vi
      .spyOn(f.enrollments, 'activateHolds')
      .mockImplementationOnce(async (manager, student, holds, now) => {
        spy.mockRestore();
        await f.enrollments.activateHolds(manager, student, holds, now);
        throw new Error('fail after progress');
      });
    await expect(settle(p.event)).rejects.toThrow('fail after progress');
    expect(await paid(p.order.id)).toBe(OrderStatus.PENDING);
    expect(
      await db.getRepository(PaymentWebhookEventEntity).countBy({ paymentId: p.payment.paymentId }),
    ).toBe(0);
    expect(
      await db
        .getRepository(EnrollmentEntity)
        .countBy({ studentId: p.student.id, status: EnrollmentStatus.ACTIVE }),
    ).toBe(0);
    expect(await settle(p.event)).toBe('SETTLED');
  });

  it('missed-webhook reconciliation queries provider and records admin provenance', async () => {
    const p = await payable();
    const admin = await f.user(UserRole.ADMIN);
    const remote = f.provider.links.get(p.event.orderCode);
    if (!remote) throw new Error('missing remote');
    f.provider.links.set(p.event.orderCode, {
      ...remote,
      status: 'PAID',
      amountPaid: p.event.amount,
      transactions: [{ reference: p.event.reference, amount: p.event.amount }],
    });
    expect((await f.reconciliation.reconcile(p.payment.paymentId, admin.id)).status).toBe(
      'SETTLED',
    );
    expect(await paid(p.order.id)).toBe(OrderStatus.PAID);
    expect(
      await db
        .getRepository(PaymentWebhookEventEntity)
        .countBy({ paymentId: p.payment.paymentId, actorId: admin.id, source: 'RECONCILIATION' }),
    ).toBe(1);
    expect(await settle(p.event)).toBe('DUPLICATE');
  });

  it('protects ownership, method, zero amount, expired/paid state and feature switches', async () => {
    const p = await payable();
    const other = await f.user();
    await expect(f.links.create(other.id, p.order.id)).rejects.toThrow();
    const cash = await f.order({ paymentType: PaymentType.CASH });
    await expect(f.links.create(cash.student.id, cash.order.id)).rejects.toThrow();
    const zero = await f.order({ amount: 0 });
    await expect(f.links.create(zero.student.id, zero.order.id)).rejects.toThrow();
    f.values.PAYOS_CREATE_LINK_ENABLED = false;
    try {
      await expect(f.links.create(p.student.id, p.order.id)).rejects.toThrow();
      expect(await settle(p.event)).toBe('SETTLED');
    } finally {
      f.values.PAYOS_CREATE_LINK_ENABLED = true;
    }
    await expect(f.links.create(p.student.id, p.order.id)).rejects.toThrow();
  });

  it('claims mail jobs safely across workers, retries SMTP failure and recovers stale lease', async () => {
    await db.getRepository(PaymentConfirmationEmailEntity).createQueryBuilder().delete().execute();
    const p = await payable();
    await settle(p.event);
    const send = vi.fn().mockRejectedValueOnce(new Error('SMTP down')).mockResolvedValue(undefined);
    const mail = { assertEnabled() {}, sendPaymentConfirmation: send } as unknown as MailService;
    const emails = new PaymentEmailService(db, mail, f.users);
    await Promise.all([emails.sendBatch(), emails.sendBatch()]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await paid(p.order.id)).toBe(OrderStatus.PAID);
    await db
      .getRepository(PaymentConfirmationEmailEntity)
      .update(
        { orderId: p.order.id },
        { status: 'SENDING', leaseUntil: new Date(Date.now() - 1), leaseToken: randomUUID() },
      );
    await emails.sendBatch();
    expect(send).toHaveBeenCalledTimes(2);
    expect(
      (
        await db
          .getRepository(PaymentConfirmationEmailEntity)
          .findOneByOrFail({ orderId: p.order.id })
      ).status,
    ).toBe('SENT');
  });
});
