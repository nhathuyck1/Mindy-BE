import 'dotenv/config';

import type { DataSource, EntityManager } from 'typeorm';

import { CourseEntity } from '../../modules/catalog/entities/course.entity.js';
import { CourseCategoryEntity } from '../../modules/catalog/entities/course-category.entity.js';
import { CourseUnitEntity } from '../../modules/catalog/entities/course-unit.entity.js';
import { toLocalDate } from '../../modules/classes/domain/class-calendar.js';
import { ClassEntity } from '../../modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../modules/classes/entities/class-session.entity.js';
import { ClassUnitEntity } from '../../modules/classes/entities/class-unit.entity.js';
import { ClassStatus } from '../../modules/classes/enums/class-status.enum.js';
import { ClassUnitStatus } from '../../modules/classes/enums/class-unit-status.enum.js';
import { DeliveryMode } from '../../modules/classes/enums/delivery-mode.enum.js';
import { SessionStatus } from '../../modules/classes/enums/session-status.enum.js';
import { UserEntity } from '../../modules/users/user.entity.js';
import { UserRole } from '../../modules/users/user-role.enum.js';
import { UserStatus } from '../../modules/users/user-status.enum.js';
import dataSource from '../data-source.js';
import { COURSE_IMAGE_URLS, seedCourseImages } from './helpers/course-images.js';

/**
 * Development seed for the catalog and classes: programming categories, courses with units
 * and classes with a weekly timetable, taught by the mentors of the account seed. Safe to run repeatedly: rows are matched
 * by slug, code or email. Existing course images are filled only when missing;
 * other existing data is left untouched.
 *
 *   pnpm seed:account        (once, creates the mentors)
 *   pnpm seed:course-class
 */

const DAY_MS = 86_400_000;
const TIME_ZONE = process.env.APP_TIME_ZONE?.trim() || 'Asia/Ho_Chi_Minh';
// Session times below are written as Vietnam local time.
const TIME_OFFSET = '+07:00';
const SESSION_MINUTES = 120;

interface CategorySeed {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

interface CourseSeed {
  readonly code: string;
  readonly categorySlug: string;
  readonly title: string;
  readonly description: string;
  readonly priceAmount: number;
  readonly isActive: boolean;
  readonly units: readonly string[];
}

interface ClassSeed {
  readonly code: string;
  readonly courseCode: string;
  readonly name: string;
  readonly mentorEmail: string;
  readonly deliveryMode: DeliveryMode;
  readonly maxStudents: number;
  readonly status: ClassStatus;
  /** Weekdays (1 = Monday ... 7 = Sunday) with a session; each unit takes one week. */
  readonly weekdays: readonly number[];
  /** Local start time, `HH:mm`. */
  readonly startTime: string;
  readonly roomName: string | null;
  readonly meetingUrl: string | null;
}

const CATEGORIES: readonly CategorySeed[] = [
  {
    slug: 'frontend-web',
    name: 'Lập trình Web Frontend',
    description: 'HTML, CSS, JavaScript và các framework xây dựng giao diện web.',
  },
  {
    slug: 'backend-web',
    name: 'Lập trình Web Backend',
    description: 'Xây dựng API, làm việc với cơ sở dữ liệu và triển khai server.',
  },
  {
    slug: 'lap-trinh-co-ban',
    name: 'Nền tảng lập trình',
    description: 'Tư duy lập trình và ngôn ngữ đầu tiên cho người mới bắt đầu.',
  },
];

const COURSES: readonly CourseSeed[] = [
  {
    code: 'HTML-CSS-101',
    categorySlug: 'frontend-web',
    title: 'HTML & CSS từ con số 0',
    description: 'Dựng trang web tĩnh hoàn chỉnh, responsive trên mọi thiết bị.',
    priceAmount: 1000,
    isActive: true,
    units: [
      'Cấu trúc trang HTML và thẻ ngữ nghĩa',
      'Form, bảng, hình ảnh và media',
      'CSS selector, box model và typography',
      'Bố cục với Flexbox và Grid',
      'Responsive design và dự án landing page',
    ],
  },
  {
    code: 'JS-101',
    categorySlug: 'frontend-web',
    title: 'JavaScript cơ bản',
    description: 'Nắm vững JavaScript hiện đại và thao tác với trang web qua DOM.',
    priceAmount: 2000,
    isActive: true,
    units: [
      'Biến, kiểu dữ liệu và toán tử',
      'Điều kiện, vòng lặp và hàm',
      'Mảng, object và các phương thức ES6+',
      'DOM, sự kiện và form validation',
      'Fetch API, Promise và async/await',
      'Mini project: ứng dụng Todo',
    ],
  },
  {
    code: 'REACT-201',
    categorySlug: 'frontend-web',
    title: 'ReactJS thực chiến',
    description: 'Xây dựng single-page application với React, hooks và React Router.',
    priceAmount: 3000,
    isActive: true,
    units: [
      'JSX, component và props',
      'State, sự kiện và render danh sách',
      'Hooks: useState, useEffect, custom hook',
      'React Router và gọi API',
      'Quản lý state, tối ưu và deploy',
    ],
  },
  {
    code: 'NODE-201',
    categorySlug: 'backend-web',
    title: 'Node.js & Express API',
    description: 'Thiết kế REST API với Node.js, Express và PostgreSQL.',
    priceAmount: 3200,
    isActive: true,
    units: [
      'Node.js runtime, module và npm',
      'Express: routing, middleware và validation',
      'PostgreSQL và truy vấn SQL cơ bản',
      'Xác thực với JWT và phân quyền',
      'Testing, logging và deploy API',
    ],
  },
  {
    code: 'PY-101',
    categorySlug: 'lap-trinh-co-ban',
    title: 'Python cho người mới bắt đầu',
    description: 'Làm quen tư duy lập trình qua Python với các bài tập thực hành.',
    priceAmount: 4000,
    isActive: true,
    units: [
      'Cài đặt môi trường, biến và kiểu dữ liệu',
      'Câu lệnh điều kiện và vòng lặp',
      'Hàm, module và xử lý lỗi',
      'List, dict và xử lý file',
    ],
  },
  {
    // Left inactive on purpose so the management screens have an unpublished course.
    code: 'TS-201',
    categorySlug: 'frontend-web',
    title: 'TypeScript nâng cao',
    description: 'Hệ thống kiểu của TypeScript cho dự án JavaScript lớn.',
    priceAmount: 5000,
    isActive: false,
    units: ['Kiểu cơ bản, interface và type alias', 'Generics và utility types'],
  },
];

/** Accounts created by the account seed (`pnpm seed:account`). */
const MENTOR_EMAILS = ['mentor.frontend@gmail.com', 'mentor.backend@gmail.com'] as const;

// Slots are chosen so that no mentor has two classes at the same time.
const CLASSES: readonly ClassSeed[] = [
  {
    code: 'HTML-CSS-101-ON1',
    courseCode: 'HTML-CSS-101',
    name: 'HTML & CSS — Online tối 2-5',
    mentorEmail: 'mentor.frontend@gmail.com',
    deliveryMode: DeliveryMode.ONLINE,
    maxStudents: 25,
    status: ClassStatus.OPEN,
    weekdays: [1, 4],
    startTime: '19:00',
    roomName: null,
    meetingUrl: 'https://meet.google.com/mindy-html-css-on1',
  },
  {
    code: 'HTML-CSS-101-OFF1',
    courseCode: 'HTML-CSS-101',
    name: 'HTML & CSS — Offline sáng thứ 7',
    mentorEmail: 'mentor.backend@gmail.com',
    deliveryMode: DeliveryMode.OFFLINE,
    maxStudents: 15,
    status: ClassStatus.OPEN,
    weekdays: [6],
    startTime: '09:00',
    roomName: 'Phòng Lab 1',
    meetingUrl: null,
  },
  {
    code: 'JS-101-ON1',
    courseCode: 'JS-101',
    name: 'JavaScript cơ bản — Online tối 3-6',
    mentorEmail: 'mentor.backend@gmail.com',
    deliveryMode: DeliveryMode.ONLINE,
    maxStudents: 25,
    status: ClassStatus.OPEN,
    weekdays: [2, 5],
    startTime: '19:00',
    roomName: null,
    meetingUrl: 'https://meet.google.com/mindy-js-on1',
  },
  {
    code: 'JS-101-OFF1',
    courseCode: 'JS-101',
    name: 'JavaScript cơ bản — Offline sáng chủ nhật',
    mentorEmail: 'mentor.frontend@gmail.com',
    deliveryMode: DeliveryMode.OFFLINE,
    maxStudents: 2,
    status: ClassStatus.OPEN,
    weekdays: [7],
    startTime: '09:00',
    roomName: 'Phòng Lab 2',
    meetingUrl: null,
  },
  {
    code: 'REACT-201-ON1',
    courseCode: 'REACT-201',
    name: 'ReactJS thực chiến — Online tối thứ 4',
    mentorEmail: 'mentor.frontend@gmail.com',
    deliveryMode: DeliveryMode.ONLINE,
    maxStudents: 20,
    status: ClassStatus.OPEN,
    weekdays: [3],
    startTime: '19:30',
    roomName: null,
    meetingUrl: 'https://meet.google.com/mindy-react-on1',
  },
  {
    code: 'PY-101-ON1',
    courseCode: 'PY-101',
    name: 'Python cơ bản — Online tối thứ 3',
    mentorEmail: 'mentor.frontend@gmail.com',
    deliveryMode: DeliveryMode.ONLINE,
    maxStudents: 30,
    status: ClassStatus.OPEN,
    weekdays: [2],
    startTime: '19:00',
    roomName: null,
    meetingUrl: 'https://meet.google.com/mindy-python-on1',
  },
  {
    // Kept in DRAFT so the open/start commands can be tried from the admin API.
    code: 'NODE-201-OFF1',
    courseCode: 'NODE-201',
    name: 'Node.js & Express — Offline tối thứ 4',
    mentorEmail: 'mentor.backend@gmail.com',
    deliveryMode: DeliveryMode.OFFLINE,
    maxStudents: 15,
    status: ClassStatus.DRAFT,
    weekdays: [3],
    startTime: '19:00',
    roomName: 'Phòng Lab 1',
    meetingUrl: null,
  },
];

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** First Monday that is at least a week away, so every seeded class is still purchasable. */
function firstClassMonday(now: Date): string {
  const earliest = addDays(toLocalDate(now, TIME_ZONE), 7);
  const weekday = new Date(`${earliest}T00:00:00Z`).getUTCDay();
  return addDays(earliest, (8 - weekday) % 7);
}

async function seedCategories(manager: EntityManager): Promise<Map<string, CourseCategoryEntity>> {
  const repository = manager.getRepository(CourseCategoryEntity);
  const bySlug = new Map<string, CourseCategoryEntity>();
  for (const seed of CATEGORIES) {
    const category =
      (await repository.findOne({ where: { slug: seed.slug } })) ??
      (await repository.save(repository.create({ ...seed, isActive: true })));
    bySlug.set(seed.slug, category);
  }

  return bySlug;
}

async function seedCourses(
  manager: EntityManager,
  categories: Map<string, CourseCategoryEntity>,
): Promise<number> {
  const courses = manager.getRepository(CourseEntity);
  const units = manager.getRepository(CourseUnitEntity);
  let created = 0;
  for (const seed of COURSES) {
    if (await courses.exists({ where: { code: seed.code } })) {
      continue;
    }

    const category = categories.get(seed.categorySlug);
    if (category === undefined) {
      throw new Error(`Unknown category ${seed.categorySlug} for course ${seed.code}`);
    }
    const course = await courses.save(
      courses.create({
        categoryId: category.id,
        code: seed.code,
        title: seed.title,
        description: seed.description,
        imgUrl: COURSE_IMAGE_URLS[seed.code] ?? null,
        priceAmount: seed.priceAmount,
        isActive: seed.isActive,
      }),
    );
    await units.save(
      seed.units.map((title, index) =>
        units.create({
          courseId: course.id,
          unitNumber: index + 1,
          title,
          description: null,
          requiredScorePercent: 80,
        }),
      ),
    );
    created += 1;
  }

  return created;
}

/** Mentors come from the account seed; this seed never creates users. */
async function findMentors(manager: EntityManager): Promise<Map<string, UserEntity>> {
  const repository = manager.getRepository(UserEntity);
  const byEmail = new Map<string, UserEntity>();
  for (const email of MENTOR_EMAILS) {
    const mentor = await repository.findOne({ where: { email } });
    if (mentor === null) {
      throw new Error(`Mentor ${email} was not found; run "pnpm seed:account" first`);
    }
    if (mentor.role !== UserRole.MENTOR || mentor.status !== UserStatus.ACTIVE) {
      throw new Error(`${email} exists but is not an active mentor`);
    }
    byEmail.set(email, mentor);
  }

  return byEmail;
}

async function seedClasses(
  manager: EntityManager,
  mentors: Map<string, UserEntity>,
  startDate: string,
): Promise<number> {
  const classes = manager.getRepository(ClassEntity);
  const classUnits = manager.getRepository(ClassUnitEntity);
  const sessions = manager.getRepository(ClassSessionEntity);
  let created = 0;
  for (const seed of CLASSES) {
    if (await classes.exists({ where: { code: seed.code } })) {
      continue;
    }

    const course = await manager.getRepository(CourseEntity).findOne({
      where: { code: seed.courseCode },
    });
    const mentor = mentors.get(seed.mentorEmail);
    if (course === null || mentor === undefined) {
      throw new Error(`Class ${seed.code} references an unknown course or mentor`);
    }
    const courseUnits = await manager.getRepository(CourseUnitEntity).find({
      where: { courseId: course.id },
      order: { unitNumber: 'ASC' },
    });

    const classEntity = await classes.save(
      classes.create({
        courseId: course.id,
        mentorId: mentor.id,
        code: seed.code,
        name: seed.name,
        startDate,
        endDate: addDays(startDate, courseUnits.length * 7 - 1),
        maxStudents: seed.maxStudents,
        deliveryMode: seed.deliveryMode,
        meetingUrl: seed.meetingUrl,
        status: seed.status,
      }),
    );
    // Same shape the application produces: one class unit per course unit, one week each.
    for (const [unitIndex, courseUnit] of courseUnits.entries()) {
      const classUnit = await classUnits.save(
        classUnits.create({
          classId: classEntity.id,
          courseUnitId: courseUnit.id,
          position: unitIndex + 1,
          unlockAt: null,
          status: ClassUnitStatus.LOCKED,
        }),
      );
      await sessions.save(
        seed.weekdays.map((weekday, sessionIndex) => {
          const date = addDays(startDate, unitIndex * 7 + weekday - 1);
          const startsAt = new Date(`${date}T${seed.startTime}:00${TIME_OFFSET}`);
          return sessions.create({
            classUnitId: classUnit.id,
            sessionNumber: sessionIndex + 1,
            title: `Tuần ${unitIndex + 1} · Buổi ${sessionIndex + 1}: ${courseUnit.title}`,
            startsAt,
            endsAt: new Date(startsAt.getTime() + SESSION_MINUTES * 60_000),
            roomName: seed.roomName,
            meetingUrl: seed.meetingUrl,
            status: SessionStatus.SCHEDULED,
          });
        }),
      );
    }
    created += 1;
  }

  return created;
}

async function seedCoursesAndClasses(source: DataSource): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_CONFIRM !== 'YES') {
    throw new Error('Demo data is not seeded in production unless SEED_DEMO_CONFIRM=YES is set');
  }

  const startDate = firstClassMonday(new Date());
  const summary = await source.transaction(async (manager) => {
    const categories = await seedCategories(manager);
    const courses = await seedCourses(manager, categories);
    const images = await seedCourseImages(manager);
    const mentors = await findMentors(manager);
    const classes = await seedClasses(manager, mentors, startDate);
    return { courses, classes, images };
  });

  console.log(
    `Course/class seed done: ${summary.courses} course(s) and ${summary.classes} class(es) created; ` +
      `${summary.images} missing course image(s) filled; new classes start on ${startDate}. ` +
      'Existing images and other existing data were preserved.',
  );
}

await dataSource.initialize();
try {
  await seedCoursesAndClasses(dataSource);
} finally {
  await dataSource.destroy();
}
