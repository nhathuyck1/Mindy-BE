import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityFoundation1790640000000 } from '../../src/database/migrations/1790640000000-identity-foundation.js';
import { AddUserUpdatedAt1790640000001 } from '../../src/database/migrations/1790640000001-add-user-updated-at.js';
import { RegistrationAndGoogleIdentity1790760000000 } from '../../src/database/migrations/1790760000000-registration-and-google-identity.js';
import { CourseCatalog1790900000000 } from '../../src/database/migrations/1790900000000-course-catalog.js';
import { ClassOperations1790900000001 } from '../../src/database/migrations/1790900000001-class-operations.js';
import { CommerceOrders1790900000002 } from '../../src/database/migrations/1790900000002-commerce-orders.js';
import { EnrollmentSeatHolds1790900000003 } from '../../src/database/migrations/1790900000003-enrollment-seat-holds.js';
import { RemoveManagerRole1790900000004 } from '../../src/database/migrations/1790900000004-remove-manager-role.js';
import { AddCourseImgUrl1791072000000 } from '../../src/database/migrations/1791072000000-add-course-img-url.js';
import { CourseDto, CourseManagementDetailDto } from '../../src/modules/catalog/dtos/course.dto.js';
import { CourseEntity } from '../../src/modules/catalog/entities/course.entity.js';
import { CourseCategoryEntity } from '../../src/modules/catalog/entities/course-category.entity.js';
import { CourseUnitEntity } from '../../src/modules/catalog/entities/course-unit.entity.js';
import { CourseCategoriesService } from '../../src/modules/catalog/services/course-categories.service.js';
import { CoursesService } from '../../src/modules/catalog/services/courses.service.js';
import { toLocalDate } from '../../src/modules/classes/domain/class-calendar.js';
import type { ClassDetailView } from '../../src/modules/classes/domain/class-views.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassUnitEntity } from '../../src/modules/classes/entities/class-unit.entity.js';
import { ClassStatus } from '../../src/modules/classes/enums/class-status.enum.js';
import { DeliveryMode } from '../../src/modules/classes/enums/delivery-mode.enum.js';
import { ClassOffersService } from '../../src/modules/classes/services/class-offers.service.js';
import { ClassReadService } from '../../src/modules/classes/services/class-read.service.js';
import { ClassScheduleService } from '../../src/modules/classes/services/class-schedule.service.js';
import { ClassesService } from '../../src/modules/classes/services/classes.service.js';
import { CartEntity } from '../../src/modules/commerce/entities/cart.entity.js';
import { CartDetailEntity } from '../../src/modules/commerce/entities/cart-detail.entity.js';
import { OrderEntity } from '../../src/modules/commerce/entities/order.entity.js';
import { OrderDetailEntity } from '../../src/modules/commerce/entities/order-detail.entity.js';
import { OrderStatus } from '../../src/modules/commerce/enums/order-status.enum.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { CartService } from '../../src/modules/commerce/services/cart.service.js';
import { CheckoutService } from '../../src/modules/commerce/services/checkout.service.js';
import { OrderExpiryService } from '../../src/modules/commerce/services/order-expiry.service.js';
import { OrderExpiryWorker } from '../../src/modules/commerce/services/order-expiry.worker.js';
import { OrdersService } from '../../src/modules/commerce/services/orders.service.js';
import { PublicCourseDetailDto } from '../../src/modules/course-browse/dtos/public-course-detail.dto.js';
import { EnrollmentEntity } from '../../src/modules/enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../src/modules/enrollments/enums/enrollment-status.enum.js';
import { EnrollmentsService } from '../../src/modules/enrollments/services/enrollments.service.js';
import { UserEntity } from '../../src/modules/users/user.entity.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { UserStatus } from '../../src/modules/users/user-status.enum.js';
import { UsersService } from '../../src/modules/users/users.service.js';

/**
 * PostgreSQL integration tests. They wipe and migrate the target database, so they only run
 * when TEST_DATABASE_URL points at a dedicated database whose name ends with `_test`.
 */
const databaseUrl = process.env.TEST_DATABASE_URL ?? '';
const isTestDatabase = /_test(\?.*)?$/.test(databaseUrl);
if (databaseUrl.length > 0 && !isTestDatabase) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends with "_test"');
}

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DAY_MS = 86_400_000;
const PHASE_2_MIGRATION_COUNT = 6;

const config = {
  getOrThrow<T>(key: string): T {
    const values: Record<string, unknown> = {
      APP_TIME_ZONE: TIME_ZONE,
      ORDER_PAYOS_HOLD_TTL_SECONDS: 900,
      ORDER_CASH_HOLD_TTL_SECONDS: 172_800,
    };
    return values[key] as T;
  },
} as unknown as ConfigService;

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) {
    return undefined;
  }

  return (error.getResponse() as { code?: string }).code;
}

async function rejectionCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error: unknown) {
    return errorCode(error) ?? `unexpected: ${String(error)}`;
  }

  return 'resolved';
}

describe.skipIf(!isTestDatabase)('Phase 2: course to checkout (PostgreSQL)', () => {
  let dataSource: DataSource;
  let categoriesService: CourseCategoriesService;
  let coursesService: CoursesService;
  let classesService: ClassesService;
  let readService: ClassReadService;
  let cartService: CartService;
  let checkoutService: CheckoutService;
  let expiryService: OrderExpiryService;
  let ordersService: OrdersService;
  let sequence = 0;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      synchronize: false,
      entities: [
        UserEntity,
        CourseCategoryEntity,
        CourseEntity,
        CourseUnitEntity,
        ClassEntity,
        ClassUnitEntity,
        ClassSessionEntity,
        EnrollmentEntity,
        CartEntity,
        CartDetailEntity,
        OrderEntity,
        OrderDetailEntity,
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
      ],
    });
    await dataSource.initialize();
    await dataSource.query('DROP SCHEMA public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.runMigrations();

    const usersService = new UsersService(dataSource.getRepository(UserEntity));
    const enrollmentsService = new EnrollmentsService(dataSource);
    categoriesService = new CourseCategoriesService(dataSource);
    coursesService = new CoursesService(dataSource);
    readService = new ClassReadService(
      dataSource,
      config,
      coursesService,
      usersService,
      enrollmentsService,
    );
    classesService = new ClassesService(
      dataSource,
      coursesService,
      usersService,
      new ClassScheduleService(config),
      readService,
    );
    const offersService = new ClassOffersService(
      dataSource,
      coursesService,
      enrollmentsService,
      readService,
    );
    expiryService = new OrderExpiryService(dataSource, enrollmentsService);
    cartService = new CartService(dataSource, offersService);
    checkoutService = new CheckoutService(
      dataSource,
      config,
      offersService,
      enrollmentsService,
      expiryService,
    );
    ordersService = new OrdersService(dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  async function createUser(role: UserRole): Promise<UserEntity> {
    const users = dataSource.getRepository(UserEntity);
    return users.save(
      users.create({
        email: `${role.toLowerCase()}-${randomUUID()}@example.com`,
        phone: null,
        passwordHash: null,
        displayName: `${role} ${++sequence}`,
        role,
        status: UserStatus.ACTIVE,
        lastLoginAt: null,
      }),
    );
  }

  async function createActiveCourse(priceAmount: number, unitCount = 2): Promise<string> {
    const suffix = ++sequence;
    const category = await categoriesService.create({ name: `Category ${suffix}` });
    const { course } = await coursesService.create({
      categoryId: category.id,
      code: `crs-${suffix}`,
      title: `Course ${suffix}`,
      priceAmount,
    });
    for (let unit = 1; unit <= unitCount; unit += 1) {
      await coursesService.addUnit(course.id, { title: `Unit ${unit}` });
    }
    await coursesService.activate(course.id);
    return course.id;
  }

  /** Each class gets its own day so one mentor can teach several classes without overlap. */
  function sessionSlot(): { startsAt: string; endsAt: string } {
    const day = new Date(Date.now() + (1 + (++sequence % 50)) * DAY_MS);
    const date = toLocalDate(day, TIME_ZONE);
    const hour = String(8 + (sequence % 10)).padStart(2, '0');
    return { startsAt: `${date}T${hour}:00:00+07:00`, endsAt: `${date}T${hour}:45:00+07:00` };
  }

  async function createDraftClass(options: {
    courseId: string;
    mentorId: string;
    maxStudents?: number;
  }): Promise<ClassDetailView> {
    return classesService.create({
      courseId: options.courseId,
      mentorId: options.mentorId,
      code: `cls-${++sequence}`,
      name: `Class ${sequence}`,
      startDate: toLocalDate(new Date(), TIME_ZONE),
      endDate: toLocalDate(new Date(Date.now() + 60 * DAY_MS), TIME_ZONE),
      maxStudents: options.maxStudents ?? 10,
      deliveryMode: DeliveryMode.OFFLINE,
    });
  }

  async function createOpenClass(
    options: { price?: number; mentorId?: string; maxStudents?: number } = {},
  ): Promise<{ classId: string; courseId: string; mentorId: string }> {
    const courseId = await createActiveCourse(options.price ?? 1_000_000);
    const mentorId = options.mentorId ?? (await createUser(UserRole.MENTOR)).id;
    const draft = await createDraftClass({ courseId, mentorId, maxStudents: options.maxStudents });
    const firstUnit = draft.units[0];
    if (firstUnit === undefined) {
      throw new Error('Expected the class to copy at least one unit');
    }

    await classesService.scheduleSession(draft.classEntity.id, {
      classUnitId: firstUnit.unit.id,
      title: 'Session 1',
      ...sessionSlot(),
    });
    await classesService.open(draft.classEntity.id);
    return { classId: draft.classEntity.id, courseId, mentorId };
  }

  async function expireHold(orderId: string): Promise<void> {
    // Move the order into the past while keeping the expires_at > created_at check satisfied.
    await dataSource.query(
      `UPDATE "orders" SET "created_at" = now() - interval '2 hours', "expires_at" = now() - interval '1 hour' WHERE "id" = $1`,
      [orderId],
    );
  }

  it('reverts and reruns the Phase 2 migrations', async () => {
    for (let step = 0; step < PHASE_2_MIGRATION_COUNT; step += 1) {
      await dataSource.undoLastMigration();
    }
    const tables: { table_name: string }[] = await dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    expect(tables.map((row) => row.table_name)).not.toContain('course_categories');
    expect(tables.map((row) => row.table_name)).toContain('users');

    const rerun = await dataSource.runMigrations();
    expect(rerun).toHaveLength(PHASE_2_MIGRATION_COUNT);
  });

  describe('catalog and class management', () => {
    it('persists course images, exposes them publicly and preserves or clears them on update', async () => {
      const category = await categoriesService.create({ name: 'Course images' });
      const created = await coursesService.create({
        categoryId: category.id,
        code: 'IMG-101',
        title: 'Course with image',
        priceAmount: 100_000,
      });
      expect(created.course.imgUrl).toBeNull();

      const imgUrl = 'https://cdn.example.com/courses/web101.jpg';
      const withImage = await coursesService.create({
        categoryId: category.id,
        code: 'IMG-102',
        title: 'Image supplied at creation',
        priceAmount: 100_000,
        imgUrl,
      });
      expect((await coursesService.getManagementDetail(withImage.course.id)).course.imgUrl).toBe(
        imgUrl,
      );

      await coursesService.update(created.course.id, { imgUrl });
      const renamed = await coursesService.update(created.course.id, { title: 'Renamed course' });
      expect(renamed.course.imgUrl).toBe(imgUrl);
      expect(
        new CourseManagementDetailDto(renamed.course, renamed.category, renamed.units).imgUrl,
      ).toBe(imgUrl);
      await coursesService.addUnit(created.course.id, { title: 'Image course unit' });
      await coursesService.activate(created.course.id);
      const publicDetail = await coursesService.getActiveDetail(created.course.id);
      expect(new PublicCourseDetailDto(publicDetail, []).imgUrl).toBe(imgUrl);
      const publicList = await coursesService.listActive({ page: 1, pageSize: 100 });
      const item = publicList.items.find(({ course }) => course.id === created.course.id);
      expect(item).toBeDefined();
      if (item !== undefined) {
        expect(new CourseDto(item.course, item.category).imgUrl).toBe(imgUrl);
      }
      const cleared = await coursesService.update(created.course.id, { imgUrl: null });
      expect(cleared.course.imgUrl).toBeNull();
      expect((await coursesService.getActiveDetail(created.course.id)).course.imgUrl).toBeNull();
    });

    it('creates a course inactive and activates it only with a unit', async () => {
      const category = await categoriesService.create({ name: 'Lập trình Web' });
      expect(category.slug).toBe('lap-trinh-web');

      const { course } = await coursesService.create({
        categoryId: category.id,
        code: 'web-101',
        title: 'Web 101',
        priceAmount: 2_500_000,
      });
      expect(course.isActive).toBe(false);
      expect(course.code).toBe('WEB-101');
      expect(await rejectionCode(coursesService.activate(course.id))).toBe('COURSE_HAS_NO_UNITS');
      expect(
        await rejectionCode(
          coursesService.create({
            categoryId: category.id,
            code: 'WEB-101',
            title: 'Duplicate',
            priceAmount: 0,
          }),
        ),
      ).toBe('COURSE_CODE_ALREADY_EXISTS');

      await coursesService.addUnit(course.id, { title: 'Unit 1' });
      const activated = await coursesService.activate(course.id);
      expect(activated.course.isActive).toBe(true);
      expect((await coursesService.listActive({ page: 1, pageSize: 100 })).items).toContainEqual(
        expect.objectContaining({ course: expect.objectContaining({ id: course.id }) }),
      );
    });

    it('copies course units into a class and keeps them when the course is reordered', async () => {
      const courseId = await createActiveCourse(500_000, 3);
      const mentor = await createUser(UserRole.MENTOR);
      const created = await createDraftClass({ courseId, mentorId: mentor.id });
      const before = created.units.map((unit) => [unit.unit.position, unit.unit.courseUnitId]);
      expect(created.classEntity.status).toBe(ClassStatus.DRAFT);
      expect(created.units.map((unit) => unit.title)).toEqual(['Unit 1', 'Unit 2', 'Unit 3']);

      const detail = await coursesService.getManagementDetail(courseId);
      const reversed = [...detail.units].reverse().map((unit) => unit.id);
      const reordered = await coursesService.reorderUnits(courseId, reversed);
      expect(reordered.units.map((unit) => unit.title)).toEqual(['Unit 3', 'Unit 2', 'Unit 1']);
      expect(reordered.units.map((unit) => unit.unitNumber)).toEqual([1, 2, 3]);
      expect(await rejectionCode(coursesService.reorderUnits(courseId, reversed.slice(0, 2)))).toBe(
        'COURSE_UNIT_ORDER_MISMATCH',
      );

      const after = await readService.getDetail(created.classEntity.id);
      expect(after.units.map((unit) => [unit.unit.position, unit.unit.courseUnitId])).toEqual(
        before,
      );
    });

    it('rejects a class for an inactive course or a non-mentor user', async () => {
      const category = await categoriesService.create({ name: `Inactive ${++sequence}` });
      const { course } = await coursesService.create({
        categoryId: category.id,
        code: `inactive-${sequence}`,
        title: 'Inactive course',
        priceAmount: 0,
      });
      const mentor = await createUser(UserRole.MENTOR);
      const student = await createUser(UserRole.STUDENT);

      expect(
        await rejectionCode(createDraftClass({ courseId: course.id, mentorId: mentor.id })),
      ).toBe('CLASS_COURSE_INACTIVE');
      expect(
        await rejectionCode(
          createDraftClass({ courseId: await createActiveCourse(0), mentorId: student.id }),
        ),
      ).toBe('CLASS_MENTOR_NOT_ELIGIBLE');
      expect(await dataSource.getRepository(ClassEntity).countBy({ courseId: course.id })).toBe(0);
    });

    it('opens a class only with a valid session and follows the lifecycle', async () => {
      const courseId = await createActiveCourse(0);
      const mentor = await createUser(UserRole.MENTOR);
      const draft = await createDraftClass({ courseId, mentorId: mentor.id });
      const classId = draft.classEntity.id;
      const unitId = draft.units[0]?.unit.id ?? '';

      expect(await rejectionCode(classesService.open(classId))).toBe('CLASS_NOT_READY_TO_OPEN');
      expect(
        await rejectionCode(
          classesService.scheduleSession(classId, {
            classUnitId: unitId,
            title: 'Too late',
            startsAt: new Date(Date.now() + 90 * DAY_MS).toISOString(),
            endsAt: new Date(Date.now() + 90 * DAY_MS + 3_600_000).toISOString(),
          }),
        ),
      ).toBe('CLASS_SESSION_OUTSIDE_CLASS_PERIOD');

      const slot = sessionSlot();
      await classesService.scheduleSession(classId, {
        classUnitId: unitId,
        title: 'Session 1',
        ...slot,
      });
      expect(
        await rejectionCode(
          classesService.scheduleSession(classId, {
            classUnitId: unitId,
            title: 'Overlap',
            ...slot,
          }),
        ),
      ).toBe('CLASS_SESSION_OVERLAP');
      expect(await rejectionCode(classesService.start(classId))).toBe('CLASS_INVALID_TRANSITION');

      expect((await classesService.open(classId)).classEntity.status).toBe(ClassStatus.OPEN);
      expect(await rejectionCode(classesService.update(classId, { maxStudents: 99 }))).toBe(
        'CLASS_NOT_EDITABLE',
      );
      expect((await readService.getOpenDetail(classId)).classEntity.id).toBe(classId);
      expect((await classesService.start(classId)).classEntity.status).toBe(
        ClassStatus.IN_PROGRESS,
      );
      expect(await rejectionCode(readService.getOpenDetail(classId))).toBe('CLASS_NOT_FOUND');
      expect((await classesService.complete(classId)).classEntity.status).toBe(
        ClassStatus.COMPLETED,
      );
      expect(await rejectionCode(classesService.cancel(classId))).toBe('CLASS_INVALID_TRANSITION');
    });

    it('refuses to open a class that clashes with another class of the same mentor', async () => {
      const mentor = await createUser(UserRole.MENTOR);
      const slot = sessionSlot();
      const openClass = async (): Promise<ClassDetailView> => {
        const draft = await createDraftClass({
          courseId: await createActiveCourse(0),
          mentorId: mentor.id,
        });
        await classesService.scheduleSession(draft.classEntity.id, {
          classUnitId: draft.units[0]?.unit.id ?? '',
          title: 'Same time',
          ...slot,
        });
        return classesService.open(draft.classEntity.id);
      };

      await openClass();
      expect(await rejectionCode(openClass())).toBe('CLASS_MENTOR_SCHEDULE_CONFLICT');
    });

    it('lists only purchasable classes publicly, filtered by delivery mode', async () => {
      const { classId, courseId } = await createOpenClass();
      const draft = await createDraftClass({
        courseId,
        mentorId: (await createUser(UserRole.MENTOR)).id,
      });

      const offline = await readService.listOpen(
        { courseId, deliveryMode: DeliveryMode.OFFLINE },
        { page: 1, pageSize: 20 },
      );
      const online = await readService.listOpen(
        { courseId, deliveryMode: DeliveryMode.ONLINE },
        { page: 1, pageSize: 20 },
      );

      expect(offline.items.map((view) => view.classEntity.id)).toEqual([classId]);
      expect(offline.items.map((view) => view.classEntity.id)).not.toContain(draft.classEntity.id);
      expect(online.total).toBe(0);
      expect(
        await readService.findCourseIdsWithOpenClasses({ deliveryMode: DeliveryMode.OFFLINE }),
      ).toContain(courseId);
    });
  });

  describe('cart and checkout', () => {
    it('checks out several classes into one PayOS order and never duplicates it', async () => {
      const student = await createUser(UserRole.STUDENT);
      const first = await createOpenClass({ price: 1_000_000 });
      const second = await createOpenClass({ price: 2_500_000 });
      await cartService.addItem(student.id, first.classId);
      const cart = await cartService.addItem(student.id, second.classId);
      expect(cart).toHaveLength(2);
      expect(await rejectionCode(cartService.addItem(student.id, first.classId))).toBe(
        'CART_ITEM_ALREADY_EXISTS',
      );

      const before = Date.now();
      const orders = await checkoutService.checkout(student.id, PaymentType.PAYOS);

      expect(orders).toHaveLength(1);
      const [created] = orders;
      expect(created?.order.status).toBe(OrderStatus.PENDING);
      expect(created?.order.totalAmount).toBe(3_500_000);
      expect(created?.order.cashMentorId).toBeNull();
      expect(created?.details).toHaveLength(2);
      const holdMs = (created?.order.expiresAt.getTime() ?? 0) - before;
      expect(holdMs).toBeGreaterThanOrEqual(900_000);
      expect(holdMs).toBeLessThan(960_000);
      expect(await cartService.getCart(student.id)).toEqual([]);
      expect(
        await dataSource.getRepository(EnrollmentEntity).countBy({
          studentId: student.id,
          status: EnrollmentStatus.PENDING_PAYMENT,
        }),
      ).toBe(2);

      expect(await rejectionCode(checkoutService.checkout(student.id, PaymentType.PAYOS))).toBe(
        'CART_EMPTY',
      );
      expect(await rejectionCode(cartService.addItem(student.id, first.classId))).toBe(
        'CLASS_ALREADY_ENROLLED',
      );
      const mine = await ordersService.listForStudent(student.id, { page: 1, pageSize: 20 });
      expect(mine.total).toBe(1);
      expect(mine.items[0]?.order.id).toBe(created?.order.id);
    });

    it('charges the current course price, not the cart snapshot', async () => {
      const student = await createUser(UserRole.STUDENT);
      const { classId, courseId } = await createOpenClass({ price: 1_000_000 });
      const [item] = await cartService.addItem(student.id, classId);
      expect(item?.detail.priceSnapshot).toBe(1_000_000);

      await coursesService.update(courseId, { priceAmount: 1_200_000 });
      const [created] = await checkoutService.checkout(student.id, PaymentType.PAYOS);

      expect(created?.order.totalAmount).toBe(1_200_000);
      expect(created?.details[0]?.priceSnapshot).toBe(1_200_000);

      await coursesService.update(courseId, { priceAmount: 9_000_000 });
      const stored = await ordersService.getForStudent(student.id, created?.order.id ?? '');
      expect(stored.details[0]?.priceSnapshot).toBe(1_200_000);
      expect(stored.order.totalAmount).toBe(1_200_000);
    });

    it('splits a cash checkout into one order per mentor with a 48 hour hold', async () => {
      const student = await createUser(UserRole.STUDENT);
      const mentorA = await createUser(UserRole.MENTOR);
      const mentorB = await createUser(UserRole.MENTOR);
      const classes = [
        await createOpenClass({ price: 100_000, mentorId: mentorA.id }),
        await createOpenClass({ price: 200_000, mentorId: mentorA.id }),
        await createOpenClass({ price: 400_000, mentorId: mentorB.id }),
      ];
      for (const { classId } of classes) {
        await cartService.addItem(student.id, classId);
      }

      const before = Date.now();
      const orders = await checkoutService.checkout(student.id, PaymentType.CASH);

      expect(orders).toHaveLength(2);
      const totalsByMentor = new Map(
        orders.map(({ order }) => [order.cashMentorId, order.totalAmount]),
      );
      expect(totalsByMentor.get(mentorA.id)).toBe(300_000);
      expect(totalsByMentor.get(mentorB.id)).toBe(400_000);
      expect(new Set(orders.map(({ order }) => order.orderCode)).size).toBe(2);
      for (const { order } of orders) {
        expect(order.paymentType).toBe(PaymentType.CASH);
        expect(order.expiresAt.getTime() - before).toBeGreaterThanOrEqual(172_800_000);
      }
    });

    it('creates nothing when one cart item is no longer purchasable', async () => {
      const student = await createUser(UserRole.STUDENT);
      const valid = await createOpenClass();
      const cancelled = await createOpenClass();
      await cartService.addItem(student.id, valid.classId);
      await cartService.addItem(student.id, cancelled.classId);
      await classesService.cancel(cancelled.classId);

      expect(await rejectionCode(checkoutService.checkout(student.id, PaymentType.CASH))).toBe(
        'CLASS_NOT_OPEN',
      );

      expect(await dataSource.getRepository(OrderEntity).countBy({ studentId: student.id })).toBe(
        0,
      );
      expect(
        await dataSource.getRepository(EnrollmentEntity).countBy({ studentId: student.id }),
      ).toBe(0);
      expect(await cartService.getCart(student.id)).toHaveLength(2);

      await cartService.removeItem(student.id, cancelled.classId);
      expect(await checkoutService.checkout(student.id, PaymentType.CASH)).toHaveLength(1);
    });

    it('does not oversell the last seat under concurrent checkouts', async () => {
      const { classId } = await createOpenClass({ maxStudents: 1 });
      const students = await Promise.all(
        Array.from({ length: 4 }, () => createUser(UserRole.STUDENT)),
      );
      for (const student of students) {
        await cartService.addItem(student.id, classId);
      }

      const results = await Promise.all(
        students.map((student) =>
          rejectionCode(checkoutService.checkout(student.id, PaymentType.PAYOS)),
        ),
      );

      expect(results.filter((result) => result === 'resolved')).toHaveLength(1);
      expect(results.filter((result) => result === 'CLASS_FULL')).toHaveLength(3);
      expect(
        await dataSource.getRepository(EnrollmentEntity).countBy({
          classId,
          status: EnrollmentStatus.PENDING_PAYMENT,
        }),
      ).toBe(1);
      expect((await readService.getDetail(classId)).occupiedSeats).toBe(1);
    });

    it('lets students check out the same classes concurrently without deadlock', async () => {
      const classes = [await createOpenClass(), await createOpenClass(), await createOpenClass()];
      const students = await Promise.all(
        Array.from({ length: 6 }, () => createUser(UserRole.STUDENT)),
      );
      for (const [index, student] of students.entries()) {
        const ordered = index % 2 === 0 ? classes : [...classes].reverse();
        for (const { classId } of ordered) {
          await cartService.addItem(student.id, classId);
        }
      }

      const results = await Promise.all(
        students.map((student) =>
          rejectionCode(checkoutService.checkout(student.id, PaymentType.CASH)),
        ),
      );

      expect(results).toEqual(Array.from({ length: 6 }, () => 'resolved'));
    });

    it('creates a single order when the same student double-submits checkout', async () => {
      const student = await createUser(UserRole.STUDENT);
      const { classId } = await createOpenClass();
      await cartService.addItem(student.id, classId);

      const results = await Promise.all([
        rejectionCode(checkoutService.checkout(student.id, PaymentType.PAYOS)),
        rejectionCode(checkoutService.checkout(student.id, PaymentType.PAYOS)),
      ]);

      expect([...results].sort()).toEqual(['CART_EMPTY', 'resolved']);
      expect(await dataSource.getRepository(OrderEntity).countBy({ studentId: student.id })).toBe(
        1,
      );
    });

    it('hides an order from another student', async () => {
      const owner = await createUser(UserRole.STUDENT);
      const stranger = await createUser(UserRole.STUDENT);
      const { classId } = await createOpenClass();
      await cartService.addItem(owner.id, classId);
      const [created] = await checkoutService.checkout(owner.id, PaymentType.CASH);
      const orderId = created?.order.id ?? '';

      expect(await rejectionCode(ordersService.getForStudent(stranger.id, orderId))).toBe(
        'ORDER_ACCESS_DENIED',
      );
      expect(await rejectionCode(ordersService.getForStudent(owner.id, randomUUID()))).toBe(
        'ORDER_NOT_FOUND',
      );
      expect(
        (await ordersService.listForStudent(stranger.id, { page: 1, pageSize: 20 })).total,
      ).toBe(0);
      expect(await cartService.getCart(stranger.id)).toEqual([]);
    });
  });

  describe('seat hold expiry', () => {
    it('expires an overdue order, frees the seat and allows a new checkout', async () => {
      const student = await createUser(UserRole.STUDENT);
      const { classId } = await createOpenClass({ maxStudents: 1 });
      await cartService.addItem(student.id, classId);
      const [created] = await checkoutService.checkout(student.id, PaymentType.PAYOS);
      const orderId = created?.order.id ?? '';
      await expireHold(orderId);

      expect(await expiryService.expireOverdueBatch(new Date(), 100)).toBeGreaterThanOrEqual(1);
      expect(await expiryService.expireOverdueBatch(new Date(), 100)).toBe(0);

      const expired = await ordersService.getForStudent(student.id, orderId);
      expect(expired.order.status).toBe(OrderStatus.EXPIRED);
      expect(expired.details).toHaveLength(1);
      const enrollments = dataSource.getRepository(EnrollmentEntity);
      expect(await enrollments.countBy({ classId, status: EnrollmentStatus.CANCELLED })).toBe(1);
      expect((await readService.getDetail(classId)).occupiedSeats).toBe(0);

      await cartService.addItem(student.id, classId);
      const [again] = await checkoutService.checkout(student.id, PaymentType.PAYOS);
      expect(again?.order.status).toBe(OrderStatus.PENDING);
      expect(await enrollments.countBy({ classId, studentId: student.id })).toBe(2);
    });

    it('releases an overdue hold during checkout before counting capacity', async () => {
      const holder = await createUser(UserRole.STUDENT);
      const buyer = await createUser(UserRole.STUDENT);
      const { classId } = await createOpenClass({ maxStudents: 1 });
      await cartService.addItem(holder.id, classId);
      const [held] = await checkoutService.checkout(holder.id, PaymentType.CASH);
      await expireHold(held?.order.id ?? '');
      // The expiry job has not run yet, so the advisory add-to-cart check would still see the
      // class as full. Put the item in the cart directly to exercise checkout itself.
      const cart = await dataSource.getRepository(CartEntity).save({ studentId: buyer.id });
      await dataSource
        .getRepository(CartDetailEntity)
        .insert({ cartId: cart.id, classId, priceSnapshot: 0 });

      const [bought] = await checkoutService.checkout(buyer.id, PaymentType.CASH);

      expect(bought?.order.status).toBe(OrderStatus.PENDING);
      const stale = await ordersService.getForStudent(holder.id, held?.order.id ?? '');
      expect(stale.order.status).toBe(OrderStatus.EXPIRED);
      expect((await readService.getDetail(classId)).occupiedSeats).toBe(1);
    });
  });

  describe('database constraints', () => {
    it('rejects a second effective enrollment and an invalid cash order', async () => {
      const student = await createUser(UserRole.STUDENT);
      const { classId } = await createOpenClass();
      await cartService.addItem(student.id, classId);
      const [created] = await checkoutService.checkout(student.id, PaymentType.PAYOS);
      const detailId = created?.details[0]?.id ?? '';

      await expect(
        dataSource.query(
          `INSERT INTO "enrollments" ("student_id", "class_id", "order_detail_id") VALUES ($1, $2, $3)`,
          [student.id, classId, detailId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        dataSource.query(
          `INSERT INTO "orders" ("student_id", "order_code", "total_amount", "payment_type", "expires_at")
           VALUES ($1, $2, 0, 'CASH', now() + interval '1 hour')`,
          [student.id, `T${randomUUID().slice(0, 12)}`],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'ck_orders_cash_mentor' });
      // 22P02: the MANAGER role no longer exists in user_role_enum.
      await expect(
        dataSource.query(`UPDATE "users" SET "role" = 'MANAGER' WHERE "id" = $1`, [student.id]),
      ).rejects.toMatchObject({ code: '22P02' });
      await expect(
        dataSource.query(`DELETE FROM "classes" WHERE "id" = $1`, [classId]),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  describe('class edits and schedule conflicts', () => {
    async function openClassAt(
      mentorId: string,
      slot: { startsAt: string; endsAt: string },
    ): Promise<string> {
      const draft = await createDraftClass({ courseId: await createActiveCourse(0), mentorId });
      await classesService.scheduleSession(draft.classEntity.id, {
        classUnitId: draft.units[0]?.unit.id ?? '',
        title: 'Fixed slot',
        ...slot,
      });
      await classesService.open(draft.classEntity.id);
      return draft.classEntity.id;
    }

    it('edits every field of a DRAFT class and validates the date range', async () => {
      const mentor = await createUser(UserRole.MENTOR);
      const nextMentor = await createUser(UserRole.MENTOR);
      const draft = await createDraftClass({
        courseId: await createActiveCourse(0),
        mentorId: mentor.id,
      });
      const classId = draft.classEntity.id;

      const updated = await classesService.update(classId, {
        name: '  Renamed class ',
        mentorId: nextMentor.id,
        maxStudents: 3,
        deliveryMode: DeliveryMode.ONLINE,
        meetingUrl: 'https://meet.example.com/room',
      });
      expect(updated.classEntity).toMatchObject({
        name: 'Renamed class',
        mentorId: nextMentor.id,
        maxStudents: 3,
        deliveryMode: DeliveryMode.ONLINE,
        meetingUrl: 'https://meet.example.com/room',
      });
      expect(updated.mentorName).toBe(nextMentor.displayName);
      expect(
        (await classesService.update(classId, { meetingUrl: null })).classEntity.meetingUrl,
      ).toBe(null);

      expect(await rejectionCode(classesService.update(classId, { endDate: '2000-01-01' }))).toBe(
        'CLASS_DATE_RANGE_INVALID',
      );
      expect(
        await rejectionCode(
          classesService.update(classId, { mentorId: (await createUser(UserRole.STUDENT)).id }),
        ),
      ).toBe('CLASS_MENTOR_NOT_ELIGIBLE');
      expect((await readService.getDetail(classId)).classEntity.mentorId).toBe(nextMentor.id);
    });

    it('rejects a mentor change on an OPEN class that would double-book the mentor', async () => {
      const busyMentor = await createUser(UserRole.MENTOR);
      const freeMentor = await createUser(UserRole.MENTOR);
      const owner = await createUser(UserRole.MENTOR);
      const slot = sessionSlot();
      await openClassAt(busyMentor.id, slot);
      const classId = await openClassAt(owner.id, slot);

      expect(await rejectionCode(classesService.update(classId, { mentorId: busyMentor.id }))).toBe(
        'CLASS_MENTOR_SCHEDULE_CONFLICT',
      );
      expect((await readService.getDetail(classId)).classEntity.mentorId).toBe(owner.id);

      const moved = await classesService.update(classId, { mentorId: freeMentor.id });
      expect(moved.classEntity.mentorId).toBe(freeMentor.id);
    });

    it('rolls back a session on an OPEN class when it clashes with the mentor calendar', async () => {
      const mentor = await createUser(UserRole.MENTOR);
      const slot = sessionSlot();
      await openClassAt(mentor.id, slot);
      const otherClassId = await openClassAt(mentor.id, sessionSlot());
      const other = await readService.getDetail(otherClassId);
      const sessionsBefore = other.units.flatMap((unit) => unit.sessions).length;

      expect(
        await rejectionCode(
          classesService.scheduleSession(otherClassId, {
            classUnitId: other.units[0]?.unit.id ?? '',
            title: 'Clash',
            ...slot,
          }),
        ),
      ).toBe('CLASS_MENTOR_SCHEDULE_CONFLICT');

      const after = await readService.getDetail(otherClassId);
      expect(after.units.flatMap((unit) => unit.sessions)).toHaveLength(sessionsBefore);
    });

    it('numbers sessions per unit without gaps under concurrent scheduling', async () => {
      const draft = await createDraftClass({
        courseId: await createActiveCourse(0),
        mentorId: (await createUser(UserRole.MENTOR)).id,
      });
      const classId = draft.classEntity.id;
      const unitId = draft.units[0]?.unit.id ?? '';
      const secondUnitId = draft.units[1]?.unit.id ?? '';
      const slots = [sessionSlot(), sessionSlot(), sessionSlot(), sessionSlot()];

      const results = await Promise.all(
        slots.slice(0, 3).map((slot, index) =>
          rejectionCode(
            classesService.scheduleSession(classId, {
              classUnitId: unitId,
              title: `Session ${index}`,
              ...slot,
            }),
          ),
        ),
      );
      await classesService.scheduleSession(classId, {
        classUnitId: secondUnitId,
        title: 'Other unit',
        ...(slots[3] ?? sessionSlot()),
      });

      expect(results).toEqual(['resolved', 'resolved', 'resolved']);
      const detail = await readService.getDetail(classId);
      const numbers = (unit: string): number[] =>
        (detail.units.find((view) => view.unit.id === unit)?.sessions ?? [])
          .map((session) => session.sessionNumber)
          .sort();
      expect(numbers(unitId)).toEqual([1, 2, 3]);
      expect(numbers(secondUnitId)).toEqual([1]);
      expect(
        await rejectionCode(
          classesService.scheduleSession(classId, {
            classUnitId: randomUUID(),
            title: 'Unknown unit',
            ...sessionSlot(),
          }),
        ),
      ).toBe('CLASS_UNIT_NOT_FOUND');
    });

    it('does not open a class whose mentor was suspended, and freezes finished classes', async () => {
      const mentor = await createUser(UserRole.MENTOR);
      const draft = await createDraftClass({
        courseId: await createActiveCourse(0),
        mentorId: mentor.id,
      });
      const classId = draft.classEntity.id;
      await classesService.scheduleSession(classId, {
        classUnitId: draft.units[0]?.unit.id ?? '',
        title: 'Session 1',
        ...sessionSlot(),
      });
      const users = dataSource.getRepository(UserEntity);
      await users.update({ id: mentor.id }, { status: UserStatus.SUSPENDED });

      expect(await rejectionCode(classesService.open(classId))).toBe('CLASS_MENTOR_NOT_ELIGIBLE');
      expect((await readService.getDetail(classId)).classEntity.status).toBe(ClassStatus.DRAFT);

      await users.update({ id: mentor.id }, { status: UserStatus.ACTIVE });
      await classesService.open(classId);
      await classesService.cancel(classId);
      expect(await rejectionCode(classesService.update(classId, { name: 'Late edit' }))).toBe(
        'CLASS_NOT_EDITABLE',
      );
      expect(
        await rejectionCode(
          classesService.scheduleSession(classId, {
            classUnitId: draft.units[0]?.unit.id ?? '',
            title: 'Late session',
            ...sessionSlot(),
          }),
        ),
      ).toBe('CLASS_NOT_EDITABLE');
    });

    it('lets only one of two concurrent creations claim a class code', async () => {
      const courseId = await createActiveCourse(0);
      const mentorId = (await createUser(UserRole.MENTOR)).id;
      const code = `dup-${++sequence}`;
      const create = (): Promise<string | undefined> =>
        rejectionCode(
          classesService.create({
            courseId,
            mentorId,
            code,
            name: 'Duplicate code',
            startDate: toLocalDate(new Date(), TIME_ZONE),
            endDate: toLocalDate(new Date(Date.now() + 30 * DAY_MS), TIME_ZONE),
            maxStudents: 5,
            deliveryMode: DeliveryMode.ONLINE,
          }),
        );

      const results = await Promise.all([create(), create()]);

      expect([...results].sort()).toEqual(['CLASS_CODE_ALREADY_EXISTS', 'resolved']);
      expect(
        await dataSource.getRepository(ClassEntity).countBy({ code: code.toUpperCase() }),
      ).toBe(1);
    });
  });

  describe('public catalog visibility', () => {
    it('hides courses of an inactive category and rejects duplicate slugs', async () => {
      const slug = `visible-${++sequence}`;
      const category = await categoriesService.create({ name: 'Visible', slug });
      const { course } = await coursesService.create({
        categoryId: category.id,
        code: `vis-${sequence}`,
        title: 'Visible course',
        priceAmount: 0,
      });
      await coursesService.addUnit(course.id, { title: 'Unit 1' });
      await coursesService.activate(course.id);
      expect((await coursesService.getActiveDetail(course.id)).units).toHaveLength(1);
      expect(await rejectionCode(categoriesService.create({ name: 'Again', slug }))).toBe(
        'COURSE_CATEGORY_SLUG_ALREADY_EXISTS',
      );
      expect(await rejectionCode(categoriesService.create({ name: '???' }))).toBe(
        'COURSE_CATEGORY_SLUG_REQUIRED',
      );

      await dataSource
        .getRepository(CourseCategoryEntity)
        .update({ id: category.id }, { isActive: false });

      expect(await rejectionCode(coursesService.getActiveDetail(course.id))).toBe(
        'COURSE_NOT_FOUND',
      );
      const listed = await coursesService.listActive({
        categoryId: category.id,
        page: 1,
        pageSize: 20,
      });
      expect(listed.total).toBe(0);
      expect(
        (await categoriesService.listActive(1, 100)).items.map((item) => item.id),
      ).not.toContain(category.id);
      expect(
        await rejectionCode(
          coursesService.create({
            categoryId: category.id,
            code: `vis2-${sequence}`,
            title: 'In inactive category',
            priceAmount: 0,
          }),
        ),
      ).toBe('COURSE_CATEGORY_INACTIVE');
      const managed = await coursesService.listForManagement({
        categoryId: category.id,
        page: 1,
        pageSize: 20,
      });
      expect(managed.total).toBe(1);
    });

    it('filters open classes by start date and pages them in a stable order', async () => {
      const courseId = await createActiveCourse(0);
      const mentorId = (await createUser(UserRole.MENTOR)).id;
      const classIds: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const draft = await createDraftClass({ courseId, mentorId });
        await classesService.scheduleSession(draft.classEntity.id, {
          classUnitId: draft.units[0]?.unit.id ?? '',
          title: 'Session',
          ...sessionSlot(),
        });
        await classesService.open(draft.classEntity.id);
        classIds.push(draft.classEntity.id);
      }
      const today = toLocalDate(new Date(), TIME_ZONE);
      const tomorrow = toLocalDate(new Date(Date.now() + DAY_MS), TIME_ZONE);

      const firstPage = await readService.listOpen({ courseId }, { page: 1, pageSize: 2 });
      const secondPage = await readService.listOpen({ courseId }, { page: 2, pageSize: 2 });
      const ids = [...firstPage.items, ...secondPage.items].map((view) => view.classEntity.id);

      expect(firstPage.total).toBe(3);
      expect(ids).toEqual([...classIds].sort());
      expect(
        (await readService.listOpen({ courseId, startsTo: today }, { page: 1, pageSize: 20 }))
          .total,
      ).toBe(3);
      expect(
        (await readService.listOpen({ courseId, startsFrom: tomorrow }, { page: 1, pageSize: 20 }))
          .total,
      ).toBe(0);
      expect(
        await readService.findCourseIdsWithOpenClasses({ startsFrom: tomorrow }),
      ).not.toContain(courseId);
    });

    it('stops selling a class whose end date has passed', async () => {
      const student = await createUser(UserRole.STUDENT);
      const { classId, courseId } = await createOpenClass();
      await dataSource.query(
        `UPDATE "classes" SET "start_date" = '2020-01-01', "end_date" = '2020-01-31' WHERE "id" = $1`,
        [classId],
      );

      expect((await readService.listOpen({ courseId }, { page: 1, pageSize: 20 })).total).toBe(0);
      expect(await rejectionCode(readService.getOpenDetail(classId))).toBe('CLASS_NOT_FOUND');
      expect(await rejectionCode(cartService.addItem(student.id, classId))).toBe('CLASS_NOT_OPEN');
    });
  });

  describe('cart rules', () => {
    it('shows the snapshot next to the current price and flags unavailable classes', async () => {
      const student = await createUser(UserRole.STUDENT);
      const { classId, courseId } = await createOpenClass({ price: 700_000 });
      await cartService.addItem(student.id, classId);
      await coursesService.update(courseId, { priceAmount: 900_000 });

      const [item] = await cartService.getCart(student.id);
      expect(item?.detail.priceSnapshot).toBe(700_000);
      expect(item?.offer.priceAmount).toBe(900_000);
      expect(item?.offer.isPurchasable).toBe(true);

      await classesService.start(classId);
      const [closed] = await cartService.getCart(student.id);
      expect(closed?.offer.isPurchasable).toBe(false);
      expect(await rejectionCode(checkoutService.checkout(student.id, PaymentType.PAYOS))).toBe(
        'CLASS_NOT_OPEN',
      );
      expect(await cartService.getCart(student.id)).toHaveLength(1);
    });

    it('rejects a full class, an unknown class and a draft class at add time', async () => {
      const first = await createUser(UserRole.STUDENT);
      const second = await createUser(UserRole.STUDENT);
      const { classId, courseId, mentorId } = await createOpenClass({ maxStudents: 1 });
      await cartService.addItem(first.id, classId);
      await checkoutService.checkout(first.id, PaymentType.CASH);
      const draft = await createDraftClass({ courseId, mentorId });

      expect(await rejectionCode(cartService.addItem(second.id, classId))).toBe('CLASS_FULL');
      expect(await rejectionCode(cartService.addItem(second.id, randomUUID()))).toBe(
        'CLASS_NOT_FOUND',
      );
      expect(await rejectionCode(cartService.addItem(second.id, draft.classEntity.id))).toBe(
        'CLASS_NOT_FOUND',
      );
      expect(await rejectionCode(cartService.removeItem(second.id, classId))).toBe(
        'CART_ITEM_NOT_FOUND',
      );
      expect(await cartService.getCart(second.id)).toEqual([]);
    });

    it('caps the cart at 20 classes', async () => {
      const student = await createUser(UserRole.STUDENT);
      const courseId = await createActiveCourse(10_000);
      const classIds: string[] = [];
      for (let index = 0; index < 21; index += 1) {
        const draft = await createDraftClass({
          courseId,
          mentorId: (await createUser(UserRole.MENTOR)).id,
        });
        await classesService.scheduleSession(draft.classEntity.id, {
          classUnitId: draft.units[0]?.unit.id ?? '',
          title: 'Session',
          ...sessionSlot(),
        });
        await classesService.open(draft.classEntity.id);
        classIds.push(draft.classEntity.id);
      }
      for (const classId of classIds.slice(0, 20)) {
        await cartService.addItem(student.id, classId);
      }

      expect(await rejectionCode(cartService.addItem(student.id, classIds[20] ?? ''))).toBe(
        'CART_LIMIT_EXCEEDED',
      );
      const orders = await checkoutService.checkout(student.id, PaymentType.CASH);
      expect(orders).toHaveLength(20);
      expect(orders.every(({ order }) => order.totalAmount === 10_000)).toBe(true);
    });

    it('pages and filters the order list of a student', async () => {
      const student = await createUser(UserRole.STUDENT);
      const orderIds: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const { classId } = await createOpenClass();
        await cartService.addItem(student.id, classId);
        const [created] = await checkoutService.checkout(student.id, PaymentType.PAYOS);
        orderIds.push(created?.order.id ?? '');
      }
      await expireHold(orderIds[0] ?? '');
      await expiryService.expireOverdueBatch(new Date(), 100);

      const firstPage = await ordersService.listForStudent(student.id, { page: 1, pageSize: 2 });
      const secondPage = await ordersService.listForStudent(student.id, { page: 2, pageSize: 2 });
      const pending = await ordersService.listForStudent(student.id, {
        page: 1,
        pageSize: 20,
        status: OrderStatus.PENDING,
      });
      const expired = await ordersService.listForStudent(student.id, {
        page: 1,
        pageSize: 20,
        status: OrderStatus.EXPIRED,
      });

      expect(firstPage.total).toBe(3);
      expect(firstPage.items).toHaveLength(2);
      expect(secondPage.items).toHaveLength(1);
      expect(
        new Set([...firstPage.items, ...secondPage.items].map(({ order }) => order.id)),
      ).toEqual(new Set(orderIds));
      expect(pending.total).toBe(2);
      expect(expired.items.map(({ order }) => order.id)).toEqual([orderIds[0]]);
    });
  });

  describe('order expiry job', () => {
    async function createOverdueOrders(count: number): Promise<string[]> {
      const orderIds: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const student = await createUser(UserRole.STUDENT);
        const { classId } = await createOpenClass();
        await cartService.addItem(student.id, classId);
        const [created] = await checkoutService.checkout(student.id, PaymentType.PAYOS);
        const orderId = created?.order.id ?? '';
        await expireHold(orderId);
        orderIds.push(orderId);
      }
      return orderIds;
    }

    async function statusesOf(orderIds: string[]): Promise<OrderStatus[]> {
      const orders = await dataSource.getRepository(OrderEntity).findBy({ id: In(orderIds) });
      return orders.map((order) => order.status);
    }

    it('expires each overdue order exactly once when batches run concurrently', async () => {
      await expiryService.expireOverdueBatch(new Date(), 1000);
      const orderIds = await createOverdueOrders(6);

      const counts = await Promise.all([
        expiryService.expireOverdueBatch(new Date(), 4),
        expiryService.expireOverdueBatch(new Date(), 4),
        expiryService.expireOverdueBatch(new Date(), 4),
      ]);

      expect(counts.reduce((total, count) => total + count, 0)).toBe(6);
      expect(await statusesOf(orderIds)).toEqual(
        Array.from({ length: 6 }, () => OrderStatus.EXPIRED),
      );
    });

    it('leaves orders that are still inside their hold untouched', async () => {
      const student = await createUser(UserRole.STUDENT);
      const { classId } = await createOpenClass();
      await cartService.addItem(student.id, classId);
      const [created] = await checkoutService.checkout(student.id, PaymentType.CASH);

      await expiryService.expireOverdueBatch(new Date(), 1000);

      expect(await statusesOf([created?.order.id ?? ''])).toEqual([OrderStatus.PENDING]);
      expect((await readService.getDetail(classId)).occupiedSeats).toBe(1);
    });

    it('drains the whole backlog in one worker run and stays idle when disabled', async () => {
      const orderIds = await createOverdueOrders(3);
      const workerConfig = (enabled: boolean): ConfigService =>
        ({
          getOrThrow<T>(key: string): T {
            const values: Record<string, unknown> = {
              ORDER_EXPIRY_JOB_ENABLED: enabled,
              ORDER_EXPIRY_JOB_INTERVAL_SECONDS: 3600,
            };
            return values[key] as T;
          },
        }) as unknown as ConfigService;

      const disabled = new OrderExpiryWorker(workerConfig(false), expiryService);
      disabled.onApplicationBootstrap();
      expect(await statusesOf(orderIds)).toEqual(
        Array.from({ length: 3 }, () => OrderStatus.PENDING),
      );

      const worker = new OrderExpiryWorker(workerConfig(true), expiryService);
      expect(await worker.run()).toBe(3);
      expect(await worker.run()).toBe(0);
      worker.onApplicationShutdown();
      expect(await statusesOf(orderIds)).toEqual(
        Array.from({ length: 3 }, () => OrderStatus.EXPIRED),
      );
    });

    it('keeps running after a failed run', async () => {
      let calls = 0;
      const flaky = {
        expireOverdueBatch: async (): Promise<number> => {
          calls += 1;
          if (calls === 1) {
            throw new Error('database unavailable');
          }
          return 0;
        },
      } as unknown as OrderExpiryService;
      const worker = new OrderExpiryWorker(config, flaky);

      expect(await worker.run()).toBe(0);
      expect(await worker.run()).toBe(0);
      expect(calls).toBe(2);
    });
  });
});
