import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { DataSource, type MigrationInterface } from 'typeorm';
import { IdentityFoundation1790640000000 } from '../../src/database/migrations/1790640000000-identity-foundation.js';
import { AddUserUpdatedAt1790640000001 } from '../../src/database/migrations/1790640000001-add-user-updated-at.js';
import { RegistrationAndGoogleIdentity1790760000000 } from '../../src/database/migrations/1790760000000-registration-and-google-identity.js';
import { CourseCatalog1790900000000 } from '../../src/database/migrations/1790900000000-course-catalog.js';
import { ClassOperations1790900000001 } from '../../src/database/migrations/1790900000001-class-operations.js';
import { CommerceOrders1790900000002 } from '../../src/database/migrations/1790900000002-commerce-orders.js';
import { EnrollmentSeatHolds1790900000003 } from '../../src/database/migrations/1790900000003-enrollment-seat-holds.js';
import { RemoveManagerRole1790900000004 } from '../../src/database/migrations/1790900000004-remove-manager-role.js';
import { AddCourseImgUrl1791072000000 } from '../../src/database/migrations/1791072000000-add-course-img-url.js';
import { PayosPayments1791158400000 } from '../../src/database/migrations/1791158400000-payos-payments.js';
import { RestoreManagerRole1791504000000 } from '../../src/database/migrations/1791504000000-restore-manager-role.js';
import { AuthSessionEntity } from '../../src/modules/auth/auth-session.entity.js';
import { EmailVerificationTokenEntity } from '../../src/modules/auth/email-verification-token.entity.js';
import { RefreshTokenEntity } from '../../src/modules/auth/refresh-token.entity.js';
import { RegistrationIntentEntity } from '../../src/modules/auth/registration-intent.entity.js';
import { UserIdentityEntity } from '../../src/modules/auth/user-identity.entity.js';
import { CourseEntity } from '../../src/modules/catalog/entities/course.entity.js';
import { CourseCategoryEntity } from '../../src/modules/catalog/entities/course-category.entity.js';
import { CourseUnitEntity } from '../../src/modules/catalog/entities/course-unit.entity.js';
import { CourseCategoriesService } from '../../src/modules/catalog/services/course-categories.service.js';
import { CoursesService } from '../../src/modules/catalog/services/courses.service.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassUnitEntity } from '../../src/modules/classes/entities/class-unit.entity.js';
import { DeliveryMode } from '../../src/modules/classes/enums/delivery-mode.enum.js';
import { ClassOffersService } from '../../src/modules/classes/services/class-offers.service.js';
import { ClassReadService } from '../../src/modules/classes/services/class-read.service.js';
import { ClassScheduleService } from '../../src/modules/classes/services/class-schedule.service.js';
import { ClassesService } from '../../src/modules/classes/services/classes.service.js';
import { StudentClassService } from '../../src/modules/classes/services/student-class.service.js';
import { CartEntity } from '../../src/modules/commerce/entities/cart.entity.js';
import { CartDetailEntity } from '../../src/modules/commerce/entities/cart-detail.entity.js';
import { OrderEntity } from '../../src/modules/commerce/entities/order.entity.js';
import { OrderDetailEntity } from '../../src/modules/commerce/entities/order-detail.entity.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { CartService } from '../../src/modules/commerce/services/cart.service.js';
import { CheckoutService } from '../../src/modules/commerce/services/checkout.service.js';
import { OrderExpiryService } from '../../src/modules/commerce/services/order-expiry.service.js';
import { OrderSettlementService } from '../../src/modules/commerce/services/order-settlement.service.js';
import { ClassUnitProgressEntity } from '../../src/modules/enrollments/entities/class-unit-progress.entity.js';
import { EnrollmentEntity } from '../../src/modules/enrollments/entities/enrollment.entity.js';
import { EnrollmentsService } from '../../src/modules/enrollments/services/enrollments.service.js';
import type {
  PaymentLink,
  PayosProvider,
  VerifiedPayment,
} from '../../src/modules/payments/domain/payos-provider.js';
import { PaymentConfirmationEmailEntity } from '../../src/modules/payments/entities/payment-confirmation-email.entity.js';
import { PaymentTransactionEntity } from '../../src/modules/payments/entities/payment-transaction.entity.js';
import { PaymentWebhookEventEntity } from '../../src/modules/payments/entities/payment-webhook-event.entity.js';
import { PayosPaymentDetailEntity } from '../../src/modules/payments/entities/payos-payment-detail.entity.js';
import { CashPaymentsService } from '../../src/modules/payments/services/cash-payments.service.js';
import { PaymentLinksService } from '../../src/modules/payments/services/payment-links.service.js';
import { PaymentReconciliationService } from '../../src/modules/payments/services/payment-reconciliation.service.js';
import { PaymentSettlementService } from '../../src/modules/payments/services/payment-settlement.service.js';
import { UserEntity } from '../../src/modules/users/user.entity.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { UsersService } from '../../src/modules/users/users.service.js';

export function separateTestUrl(suffix: string): string {
  const base = process.env.TEST_DATABASE_URL ?? '';
  if (!base) return '';
  const url = new URL(base);
  if (!/\/\w+_test$/.test(url.pathname) || !/^\w+$/.test(suffix))
    throw new Error('Dedicated _test database required');
  url.pathname = url.pathname.replace(/_test$/, `_${suffix}_test`);
  return url.toString();
}

export async function paymentDatabase(
  suffix = 'payments',
  extra: {
    readonly entities?: readonly (new () => object)[];
    readonly migrations?: readonly (new () => MigrationInterface)[];
  } = {},
): Promise<DataSource> {
  const url = separateTestUrl(suffix);
  const admin = new DataSource({ type: 'postgres', url: process.env.TEST_DATABASE_URL });
  await admin.initialize();
  const name = new URL(url).pathname.slice(1);
  if (!/^\w+_test$/.test(name)) throw new Error('Invalid test database name');
  const rows: unknown[] = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
  if (rows.length === 0) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.destroy();
  const db = new DataSource({
    type: 'postgres',
    url,
    entities: [
      AuthSessionEntity,
      EmailVerificationTokenEntity,
      RefreshTokenEntity,
      RegistrationIntentEntity,
      UserIdentityEntity,
      CourseCategoryEntity,
      CourseUnitEntity,
      CourseEntity,
      ClassSessionEntity,
      ClassUnitEntity,
      ClassEntity,
      CartDetailEntity,
      CartEntity,
      OrderDetailEntity,
      OrderEntity,
      ClassUnitProgressEntity,
      EnrollmentEntity,
      PaymentConfirmationEmailEntity,
      PaymentTransactionEntity,
      PaymentWebhookEventEntity,
      PayosPaymentDetailEntity,
      UserEntity,
      ...(extra.entities ?? []),
    ],
    migrations: [
      IdentityFoundation1790640000000,
      AddUserUpdatedAt1790640000001,
      RegistrationAndGoogleIdentity1790760000000,
      CourseCatalog1790900000000,
      ClassOperations1790900000001,
      CommerceOrders1790900000002,
      EnrollmentSeatHolds1790900000003,
      RemoveManagerRole1790900000004,
      AddCourseImgUrl1791072000000,
      PayosPayments1791158400000,
      RestoreManagerRole1791504000000,
      ...(extra.migrations ?? []),
    ],
    synchronize: false,
  });
  await db.initialize();
  await db.query('DROP SCHEMA public CASCADE');
  await db.query('CREATE SCHEMA public');
  await db.runMigrations();
  return db;
}

export class FakePayos implements PayosProvider {
  readonly channelKey = 'test-channel';
  readonly links = new Map<number, PaymentLink>();
  creates = 0;
  onCreate: ((link: PaymentLink) => Promise<void>) | null = null;
  failAfterCreate = false;
  async get(code: number): Promise<PaymentLink | null> {
    return this.links.get(code) ?? null;
  }
  async create(code: number, amount: number): Promise<PaymentLink> {
    this.creates++;
    const link = {
      id: randomUUID().replaceAll('-', ''),
      orderCode: code,
      amount,
      amountPaid: 0,
      status: 'PENDING',
      checkoutUrl: 'https://pay.payos.vn/web/test',
      qrCode: 'test-qr',
      transactions: [],
    };
    this.links.set(code, link);
    if (this.onCreate) await this.onCreate(link);
    if (this.failAfterCreate) {
      this.failAfterCreate = false;
      throw new Error('response lost');
    }
    return link;
  }
  async verify(): Promise<VerifiedPayment> {
    throw new Error('Use real adapter verification tests');
  }
}

export function paymentFixture(db: DataSource) {
  const values: Record<string, unknown> = {
    APP_TIME_ZONE: 'Asia/Ho_Chi_Minh',
    ORDER_PAYOS_HOLD_TTL_SECONDS: 900,
    ORDER_CASH_HOLD_TTL_SECONDS: 172800,
    PAYOS_ENABLED: true,
    PAYOS_CREATE_LINK_ENABLED: true,
  };
  const config = { getOrThrow: <T>(key: string): T => values[key] as T } as ConfigService;
  const provider = new FakePayos();
  const users = new UsersService(db.getRepository(UserEntity));
  const enrollments = new EnrollmentsService(db);
  const courses = new CoursesService(db);
  const read = new ClassReadService(db, config, courses, users, enrollments);
  const offers = new ClassOffersService(db, courses, enrollments, read);
  const classes = new ClassesService(db, courses, users, new ClassScheduleService(config), read);
  const expiry = new OrderExpiryService(db, enrollments);
  const cart = new CartService(db, offers);
  const checkout = new CheckoutService(db, config, offers, enrollments, expiry);
  const orders = new OrderSettlementService();
  const settlement = new PaymentSettlementService(db, orders, offers, enrollments, provider);
  const links = new PaymentLinksService(db, orders, config, provider);
  let day = 1;
  const user = (role: UserRole = UserRole.STUDENT) =>
    users.createUser(
      {
        email: `${randomUUID()}@test.local`,
        displayName: 'Test',
        password: 'Unused-test-password1!',
        role,
      },
      'unused',
    );
  async function order(
    options: {
      count?: number;
      amount?: number;
      paymentType?: PaymentType;
      maxStudents?: number;
    } = {},
  ) {
    const student = await user();
    const mentor = await user(UserRole.MENTOR);
    const cat = await new CourseCategoriesService(db).create({ name: randomUUID() });
    const { course } = await courses.create({
      categoryId: cat.id,
      code: randomUUID(),
      title: 'Test course',
      priceAmount: options.amount ?? 5000,
    });
    await courses.addUnit(course.id, { title: 'Unit one' });
    await courses.addUnit(course.id, { title: 'Unit two' });
    await courses.activate(course.id);
    const classIds: string[] = [];
    for (let n = 0; n < (options.count ?? 1); n++) {
      const slot = new Date(Date.now() + ++day * 86400000).toISOString().slice(0, 10);
      const view = await classes.create({
        courseId: course.id,
        mentorId: mentor.id,
        code: randomUUID(),
        name: 'Test class',
        deliveryMode: DeliveryMode.ONLINE,
        startDate: slot,
        endDate: slot,
        maxStudents: options.maxStudents ?? 1,
        meetingUrl: 'https://meet.example.test/private',
      });
      const unit = view.units[0];
      if (!unit) throw new Error('Missing units');
      await classes.scheduleSession(view.classEntity.id, {
        classUnitId: unit.unit.id,
        title: 'Session one',
        startsAt: `${slot}T08:00:00+07:00`,
        endsAt: `${slot}T09:00:00+07:00`,
      });
      await classes.open(view.classEntity.id);
      await cart.addItem(student.id, view.classEntity.id);
      classIds.push(view.classEntity.id);
    }
    const [result] = await checkout.checkout(student.id, options.paymentType ?? PaymentType.PAYOS);
    if (!result) throw new Error('Missing order');
    return { student, mentor, classIds, ...result };
  }
  return {
    values,
    config,
    provider,
    users,
    enrollments,
    offers,
    read,
    classes,
    expiry,
    cart,
    checkout,
    settlement,
    links,
    cash: new CashPaymentsService(db, orders, offers, read, enrollments),
    user,
    order,
    access: new StudentClassService(enrollments, read),
    reconciliation: new PaymentReconciliationService(db, provider, settlement),
  };
}
