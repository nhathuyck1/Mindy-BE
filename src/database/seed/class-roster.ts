import 'dotenv/config';

import { type EntityManager, In } from 'typeorm';
import { PasswordService } from '../../modules/auth/services/password.service.js';
import { CourseEntity } from '../../modules/catalog/entities/course.entity.js';
import { ClassEntity } from '../../modules/classes/entities/class.entity.js';
import { ClassUnitEntity } from '../../modules/classes/entities/class-unit.entity.js';
import { ClassStatus } from '../../modules/classes/enums/class-status.enum.js';
import { OrderEntity } from '../../modules/commerce/entities/order.entity.js';
import { OrderDetailEntity } from '../../modules/commerce/entities/order-detail.entity.js';
import { OrderStatus } from '../../modules/commerce/enums/order-status.enum.js';
import { PaymentType } from '../../modules/commerce/enums/payment-type.enum.js';
import { ClassUnitProgressEntity } from '../../modules/enrollments/entities/class-unit-progress.entity.js';
import {
  EFFECTIVE_ENROLLMENT_STATUSES,
  EnrollmentEntity,
  SEAT_HOLDING_ENROLLMENT_STATUSES,
} from '../../modules/enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../modules/enrollments/enums/enrollment-status.enum.js';
import { PaymentTransactionEntity } from '../../modules/payments/entities/payment-transaction.entity.js';
import { PaymentStatus } from '../../modules/payments/enums/payment-status.enum.js';
import { UserEntity } from '../../modules/users/user.entity.js';
import { UserRole } from '../../modules/users/user-role.enum.js';
import { UserStatus } from '../../modules/users/user-status.enum.js';
import dataSource from '../data-source.js';

const ROSTERS = [
  { classCode: 'HTML-CSS-101-ON1', emailPrefix: 'demo.html', count: 20 },
  { classCode: 'JS-101-ON1', emailPrefix: 'demo.js', count: 24 },
] as const;

const NAMES = [
  'Nguyễn Hoàng An',
  'Trần Ngọc Anh',
  'Lê Minh Bảo',
  'Phạm Thanh Bình',
  'Hoàng Khánh Chi',
  'Huỳnh Anh Dũng',
  'Phan Thùy Dương',
  'Vũ Minh Đức',
  'Võ Hương Giang',
  'Đặng Thu Hà',
  'Bùi Gia Hân',
  'Đỗ Quang Huy',
  'Hồ Tuấn Kiệt',
  'Ngô Khánh Linh',
  'Dương Nhật Minh',
  'Lý Bảo Ngọc',
  'Đinh Phương Nhi',
  'Mai Hoàng Phúc',
  'Trịnh Minh Quân',
  'Đào Anh Thư',
  'Nguyễn Quốc Bảo',
  'Trần Phương Chi',
  'Lê Tiến Đạt',
  'Phạm Hải Đăng',
  'Hoàng Mỹ Duyên',
  'Huỳnh Gia Huy',
  'Phan Ngọc Hân',
  'Vũ Trung Hiếu',
  'Võ Quỳnh Hoa',
  'Đặng Minh Khang',
  'Bùi Ngọc Lan',
  'Đỗ Hoàng Long',
  'Hồ Thảo My',
  'Ngô Hoài Nam',
  'Dương Yến Nhi',
  'Lý Kim Oanh',
  'Đinh Hữu Phát',
  'Mai Như Quỳnh',
  'Trịnh Thanh Sơn',
  'Đào Minh Tâm',
  'Nguyễn Bảo Trâm',
  'Trần Anh Tú',
  'Lê Tường Vy',
  'Phạm Hải Yến',
];

async function seedRoster(
  manager: EntityManager,
  seed: (typeof ROSTERS)[number],
  names: readonly string[],
  passwordHash: string,
): Promise<string> {
  const classEntity = await manager.getRepository(ClassEntity).findOne({
    select: {
      id: true,
      courseId: true,
      mentorId: true,
      code: true,
      name: true,
      status: true,
      maxStudents: true,
    },
    where: { code: seed.classCode },
    lock: { mode: 'pessimistic_write' },
  });
  if (!classEntity) throw new Error(`Missing ${seed.classCode}; run pnpm seed:course-class first`);
  if (![ClassStatus.OPEN, ClassStatus.IN_PROGRESS].includes(classEntity.status)) {
    throw new Error(`${seed.classCode} must be OPEN or IN_PROGRESS`);
  }
  const course = await manager.getRepository(CourseEntity).findOneByOrFail({
    id: classEntity.courseId,
  });
  const units = await manager.getRepository(ClassUnitEntity).findBy({ classId: classEntity.id });
  if (!units.length) throw new Error(`${seed.classCode} has no class units`);

  const users = manager.getRepository(UserEntity);
  const enrollments = manager.getRepository(EnrollmentEntity);
  let occupied = await enrollments.countBy({
    classId: classEntity.id,
    status: In([...SEAT_HOLDING_ENROLLMENT_STATUSES]),
  });
  let created = 0;
  for (let index = 0; index < seed.count; index += 1) {
    const displayName = names[index];
    if (!displayName) throw new Error('Missing demo student name');
    const number = String(index + 1).padStart(2, '0');
    const email = `${seed.emailPrefix}.${number}@example.com`;
    let student = await users.findOneBy({ email });
    if (student && (student.role !== UserRole.STUDENT || student.status !== UserStatus.ACTIVE)) {
      throw new Error(`${email} exists but is not an active student`);
    }
    if (!student) {
      student = await users.save(
        users.create({
          email,
          displayName,
          passwordHash,
          phone: null,
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
          lastLoginAt: null,
        }),
      );
    }
    const existing = await enrollments.findOneBy({
      studentId: student.id,
      classId: classEntity.id,
      status: In([...EFFECTIVE_ENROLLMENT_STATUSES]),
    });
    if (existing) continue;
    if (occupied >= classEntity.maxStudents) {
      throw new Error(`${seed.classCode} is full; roster seed rolled back`);
    }

    const now = new Date();
    // Demo fixtures mirror a confirmed CASH purchase; no provider or email is called.
    const orders = manager.getRepository(OrderEntity);
    const order = await orders.save(
      orders.create({
        studentId: student.id,
        orderCode: `DEMO-ROSTER-${seed.classCode}-${number}`,
        totalAmount: course.priceAmount,
        status: OrderStatus.PAID,
        paymentType: PaymentType.CASH,
        cashMentorId: classEntity.mentorId,
        expiresAt: new Date(now.getTime() + 86_400_000),
        paidAt: now,
      }),
    );
    const details = manager.getRepository(OrderDetailEntity);
    const detail = await details.save(
      details.create({
        orderId: order.id,
        classId: classEntity.id,
        courseTitleSnapshot: course.title,
        classNameSnapshot: classEntity.name,
        priceSnapshot: course.priceAmount,
        quantity: 1,
        totalAmount: course.priceAmount,
      }),
    );
    await manager.getRepository(PaymentTransactionEntity).insert({
      orderId: order.id,
      amount: course.priceAmount,
      status: PaymentStatus.SUCCEEDED,
      referenceCode: `cash:${classEntity.mentorId}:${order.id}`,
      paidAt: now,
    });
    const enrollment = await enrollments.save(
      enrollments.create({
        studentId: student.id,
        classId: classEntity.id,
        orderDetailId: detail.id,
        status: EnrollmentStatus.ACTIVE,
        enrolledAt: now,
      }),
    );
    await manager.getRepository(ClassUnitProgressEntity).insert(
      units.map((unit) => ({
        enrollmentId: enrollment.id,
        classUnitId: unit.id,
        status: 'NOT_STARTED',
        progressPercent: '0',
        completedAt: null,
      })),
    );
    occupied += 1;
    created += 1;
  }
  return `${seed.classCode}: ${created} enrollment(s) created, ${occupied}/${classEntity.maxStudents} seats occupied`;
}

if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_CONFIRM !== 'YES') {
  throw new Error('Demo rosters are not seeded in production unless SEED_DEMO_CONFIRM=YES');
}
const password = process.env.SEED_ACCOUNT_PASSWORD?.trim();
if (!password) throw new Error('SEED_ACCOUNT_PASSWORD is required');
const passwordHash = await new PasswordService().hashPassword(password);

await dataSource.initialize();
try {
  const summary = await dataSource.transaction(async (manager) => {
    const results: string[] = [];
    let offset = 0;
    for (const seed of ROSTERS) {
      results.push(
        await seedRoster(manager, seed, NAMES.slice(offset, offset + seed.count), passwordHash),
      );
      offset += seed.count;
    }
    return results;
  });
  console.log(`Demo roster seed done:\n  ${summary.join('\n  ')}`);
} finally {
  await dataSource.destroy();
}
