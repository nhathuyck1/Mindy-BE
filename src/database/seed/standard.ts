import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';

import { gradeQuiz, type OptionLabel } from '../../modules/assignments/domain/quiz.js';
import { PasswordService } from '../../modules/auth/services/password.service.js';
import { attendanceDeadline, toLocalDate } from '../../modules/classes/domain/class-calendar.js';
import { ClassStatus } from '../../modules/classes/enums/class-status.enum.js';
import { DeliveryMode } from '../../modules/classes/enums/delivery-mode.enum.js';
import { sanitizeArticle } from '../../modules/materials/domain/article-sanitizer.js';
import { UserRole } from '../../modules/users/user-role.enum.js';
import { UserStatus } from '../../modules/users/user-status.enum.js';
import { normalizeEmail } from '../../modules/users/users.service.js';
import dataSource from '../data-source.js';
import { COURSE_IMAGE_URLS } from './helpers/course-images.js';
import {
  CLASSES,
  classSessions,
  SESSIONS_PER_UNIT,
  type SeedClass,
  TIME_ZONE,
} from './helpers/standard-plan.js';

/**
 * Standard test data for a freshly migrated database: staff, students, catalog, classes in
 * every lifecycle state, paid/pending/expired orders, attendance, progress, materials and
 * quizzes. Dates are relative to today. Re-running is safe: users are matched by email
 * (password reset), catalog by slug/code, and an existing class code skips that class.
 *
 *   pnpm seed:admin && pnpm seed:standard        (SEED_ACCOUNT_PASSWORD required)
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const STAFF: readonly [email: string, name: string, role: UserRole][] = [
  ['manager.ops@example.com', 'Lê Thu Hằng', UserRole.MANAGER],
  ['manager.sales@example.com', 'Ngô Đức Mạnh', UserRole.MANAGER],
  ['mentor.frontend@example.com', 'Nguyễn Minh Anh', UserRole.MENTOR],
  ['mentor.backend@example.com', 'Trần Quốc Bảo', UserRole.MENTOR],
  ['mentor.python@example.com', 'Hoàng Thị Lan', UserRole.MENTOR],
];
// Key `an` logs in as student.an@example.com; numbered students as student.s01@example.com.
const STUDENTS: Readonly<Record<string, string>> = {
  an: 'Phạm Gia An',
  binh: 'Đỗ Thanh Bình',
  chi: 'Vũ Khánh Chi',
  ...Object.fromEntries(
    [
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
      'Nguyễn Bảo Trâm',
    ].map((name, i) => [`s${String(i + 1).padStart(2, '0')}`, name]),
  ),
};

const CATEGORIES = [
  ['frontend-web', 'Lập trình Web Frontend', 'HTML, CSS, JavaScript và framework giao diện.'],
  ['backend-web', 'Lập trình Web Backend', 'API, cơ sở dữ liệu và triển khai server.'],
  ['lap-trinh-co-ban', 'Nền tảng lập trình', 'Tư duy lập trình cho người mới bắt đầu.'],
] as const;

// Tiny VND prices on purpose: real payOS smoke tests charge the actual amount.
const COURSES: readonly {
  code: string;
  category: string;
  title: string;
  price: number;
  active: boolean;
  units: readonly string[];
}[] = [
  {
    code: 'HTML-CSS-101',
    category: 'frontend-web',
    title: 'HTML & CSS từ con số 0',
    price: 1000,
    active: true,
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
    category: 'frontend-web',
    title: 'JavaScript cơ bản',
    price: 2000,
    active: true,
    units: [
      'Biến, kiểu dữ liệu và toán tử',
      'Điều kiện, vòng lặp và hàm',
      'Mảng, object và ES6+',
      'DOM, sự kiện và form validation',
      'Fetch API, Promise và async/await',
      'Mini project: ứng dụng Todo',
    ],
  },
  {
    code: 'REACT-201',
    category: 'frontend-web',
    title: 'ReactJS thực chiến',
    price: 3000,
    active: true,
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
    category: 'backend-web',
    title: 'Node.js & Express API',
    price: 3200,
    active: true,
    units: [
      'Node.js runtime, module và npm',
      'Express: routing, middleware và validation',
      'PostgreSQL và truy vấn SQL cơ bản',
      'Xác thực JWT và phân quyền',
      'Testing, logging và deploy API',
    ],
  },
  {
    code: 'PY-101',
    category: 'lap-trinh-co-ban',
    title: 'Python cho người mới bắt đầu',
    price: 4000,
    active: true,
    units: [
      'Cài đặt môi trường, biến và kiểu dữ liệu',
      'Câu lệnh điều kiện và vòng lặp',
      'Hàm, module và xử lý lỗi',
      'List, dict và xử lý file',
    ],
  },
  {
    // Inactive on purpose: unpublished course in management screens.
    code: 'TS-201',
    category: 'frontend-web',
    title: 'TypeScript nâng cao',
    price: 5000,
    active: false,
    units: ['Kiểu cơ bản, interface và type alias', 'Generics và utility types'],
  },
];

const QUIZ: readonly { prompt: string; options: readonly string[]; correct: OptionLabel }[] = [
  {
    prompt: 'Từ khoá nào khai báo hằng số?',
    options: ['var', 'let', 'const', 'static'],
    correct: 'C',
  },
  {
    prompt: 'typeof null trả về gì?',
    options: ['"null"', '"object"', '"undefined"', '"number"'],
    correct: 'B',
  },
  {
    prompt: '[1, 2, 3].map((x) => x * 2) cho kết quả?',
    options: ['[2, 4, 6]', '[1, 2, 3]', '6', 'undefined'],
    correct: 'A',
  },
  { prompt: 'Toán tử so sánh nghiêm ngặt là?', options: ['=', '==', '===', '=>'], correct: 'C' },
  {
    prompt: 'Phương thức thêm phần tử vào cuối mảng?',
    options: ['shift()', 'push()', 'pop()', 'slice()'],
    correct: 'B',
  },
];
const LABELS: readonly OptionLabel[] = ['A', 'B', 'C', 'D'];

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** Insert one row (column names are trusted constants) and return the requested column. */
async function ins(
  m: EntityManager,
  table: string,
  row: Record<string, unknown>,
  returning = 'id',
): Promise<string> {
  const keys = Object.keys(row);
  const rows: Record<string, string>[] = await m.query(
    `INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING ${returning}`,
    keys.map((k) => row[k]),
  );
  const value = rows[0]?.[returning];
  if (value === undefined) throw new Error(`Insert into ${table} returned nothing`);
  return value;
}

async function insAssignmentAudit(
  m: EntityManager,
  assignmentId: string,
  actorId: string | null,
  action: string,
  version: number,
  occurredAt: Date,
  submissionId: string | null = null,
  reason: string | null = null,
): Promise<void> {
  const auditId = randomUUID();
  await m.query(
    `INSERT INTO audit_events(source,id,actor_id,occurred_at,data)
    VALUES('assignment_audits',$1,$2::uuid,$3,jsonb_build_object(
      'id',$1::uuid,'assignment_id',$4::uuid,'actor_id',$2::uuid,'action',$5::text,
      'version',$6::integer,'reason',$7::text,'submission_id',$8::uuid,
      'grade_id',null,'created_at',$3::timestamptz))`,
    [auditId, actorId, occurredAt, assignmentId, action, version, reason, submissionId],
  );
}

async function upsertUser(
  m: EntityManager,
  email: string,
  displayName: string,
  role: UserRole,
  status: UserStatus,
  passwordHash: string,
): Promise<string> {
  const rows: { id: string; role: string }[] = await m.query(
    'SELECT id,role FROM users WHERE email=$1',
    [normalizeEmail(email)],
  );
  const existing = rows[0];
  if (!existing)
    return ins(m, 'users', {
      email: normalizeEmail(email),
      display_name: displayName,
      role,
      status,
      password_hash: passwordHash,
    });
  if (existing.role !== role) throw new Error(`${email} already exists with role ${existing.role}`);
  await m.query(
    'UPDATE users SET display_name=$2,status=$3,password_hash=$4,updated_at=now() WHERE id=$1',
    [existing.id, displayName, status, passwordHash],
  );
  return existing.id;
}

async function seedCatalog(m: EntityManager, managerId: string, now: Date): Promise<void> {
  for (const [slug, name, description] of CATEGORIES)
    await m.query(
      'INSERT INTO course_categories(slug,name,description,is_active) VALUES($1,$2,$3,true) ON CONFLICT(slug) DO NOTHING',
      [slug, name, description],
    );
  for (const c of COURSES) {
    const exists: unknown[] = await m.query('SELECT 1 FROM courses WHERE code=$1', [c.code]);
    if (exists.length) continue;
    const courseId = await ins(m, 'courses', {
      category_id: (
        await m.query('SELECT id FROM course_categories WHERE slug=$1', [c.category])
      )[0].id,
      code: c.code,
      title: c.title,
      description: `Khoá ${c.title} với ${c.units.length} chương, học qua dự án thực hành.`,
      img_url: COURSE_IMAGE_URLS[c.code] ?? null,
      price_amount: c.price,
      is_active: c.active,
    });
    const reviewedAt = new Date(now.getTime() - 60 * DAY);
    for (const [i, title] of c.units.entries()) {
      const unitId = await ins(m, 'course_units', {
        course_id: courseId,
        unit_number: i + 1,
        title,
        description: null,
        required_score_percent: 80,
      });
      if (!c.active) continue;
      // One approved, published article per unit: the student material path needs no MinIO.
      const materialId = await ins(m, 'materials', {
        course_unit_id: unitId,
        content_type: 'ARTICLE',
        content_html: sanitizeArticle(
          `<h2>${title}</h2><p>Tóm tắt kiến thức chính của chương và bài tập về nhà.</p><ul><li>Đọc trước bài giảng</li><li>Làm bài tập cuối chương</li></ul>`,
        ).contentHtml,
        content_schema_version: 1,
        title: `Tài liệu: ${title}`,
        description: 'Tài liệu đọc trước buổi học.',
        sort_order: 0,
        created_by: managerId,
        revision: 1,
        review_status: 'APPROVED',
        approved_revision: 1,
        reviewed_by: managerId,
        reviewed_at: reviewedAt,
        first_approved_at: reviewedAt,
        published_at: reviewedAt,
        created_at: reviewedAt,
      });
      await ins(m, 'material_audit_events', {
        id: randomUUID(),
        material_id: materialId,
        actor_id: managerId,
        action: 'PUBLISH',
        revision: 1,
        occurred_at: reviewedAt,
      });
    }
  }
}

interface Ctx {
  readonly now: Date;
  readonly users: ReadonlyMap<string, string>;
  readonly managerId: string;
}

const id = (users: ReadonlyMap<string, string>, key: string): string => {
  const value = users.get(key);
  if (!value) throw new Error(`Unknown seed user ${key}`);
  return value;
};

async function seedClass(m: EntityManager, seed: SeedClass, ctx: Ctx): Promise<string> {
  const { now } = ctx;
  if ((await m.query('SELECT 1 FROM classes WHERE code=$1', [seed.code])).length)
    return `${seed.code}: đã có, bỏ qua`;
  const [course]: { id: string; title: string; price_amount: string }[] = await m.query(
    'SELECT id,title,price_amount FROM courses WHERE code=$1',
    [seed.courseCode],
  );
  if (!course) throw new Error(`Missing course ${seed.courseCode}`);
  const price = Number(course.price_amount);
  const units: { id: string; title: string }[] = await m.query(
    'SELECT id,title FROM course_units WHERE course_id=$1 ORDER BY unit_number',
    [course.id],
  );
  const mentorId = id(ctx.users, seed.mentorEmail);
  const { startDate, times } = classSessions(seed, units.length, now);
  const first = times[0];
  const last = times.at(-1);
  if (!first || !last) throw new Error(`${seed.code} has no sessions`);
  const started = [ClassStatus.IN_PROGRESS, ClassStatus.COMPLETED].includes(seed.status);
  const meetingUrl =
    seed.deliveryMode === DeliveryMode.ONLINE
      ? `https://meet.google.com/mindy-${seed.code.toLowerCase()}`
      : null;

  const classId = await ins(m, 'classes', {
    course_id: course.id,
    mentor_id: mentorId,
    code: seed.code,
    name: seed.name,
    start_date: startDate,
    end_date: toLocalDate(new Date(last.endsAt.getTime() - 1), TIME_ZONE),
    max_students: seed.maxStudents,
    delivery_mode: seed.deliveryMode,
    meeting_url: meetingUrl,
    status: seed.status,
  });
  await m.query(
    'INSERT INTO class_weekly_schedules(class_id,start_date,weekly_slots) VALUES($1,$2,$3::jsonb)',
    [classId, startDate, JSON.stringify(seed.weeklySlots)],
  );

  // Sessions that have ended in a started class are completed, the rest stay scheduled.
  const units2: { id: string; done: number; lastEnd: Date }[] = [];
  const sessions: { id: string; startsAt: Date; endsAt: Date; done: boolean }[] = [];
  for (const [u, unit] of units.entries()) {
    const unitId = await ins(m, 'class_units', {
      class_id: classId,
      course_unit_id: unit.id,
      position: u + 1,
      status: 'OPEN',
    });
    let done = 0;
    let lastEnd = now;
    for (let n = 0; n < SESSIONS_PER_UNIT; n += 1) {
      const t = times[u * SESSIONS_PER_UNIT + n];
      if (!t) throw new Error('Session plan invariant');
      const isDone = started && t.endsAt <= now;
      done += Number(isDone);
      lastEnd = t.endsAt;
      const sessionId = await ins(m, 'class_sessions', {
        class_unit_id: unitId,
        session_number: n + 1,
        title: `Buổi ${u * SESSIONS_PER_UNIT + n + 1}: ${unit.title}`,
        starts_at: t.startsAt,
        ends_at: t.endsAt,
        room_name: seed.roomName,
        meeting_url: meetingUrl,
        status: isDone ? 'COMPLETED' : 'SCHEDULED',
        ...(isDone && {
          teaching_mentor_id: mentorId,
          actual_started_at: t.startsAt,
          actual_ended_at: t.endsAt,
          started_by: mentorId,
          completed_by: mentorId,
          editable_until: attendanceDeadline(t.startsAt, TIME_ZONE),
          version: 3,
        }),
      });
      if (isDone) {
        await ins(m, 'session_lifecycle_audits', {
          id: randomUUID(),
          session_id: sessionId,
          actor_id: mentorId,
          old_status: 'SCHEDULED',
          new_status: 'IN_PROGRESS',
          reason: null,
          version: 2,
          occurred_at: t.startsAt,
        });
        await ins(m, 'session_lifecycle_audits', {
          id: randomUUID(),
          session_id: sessionId,
          actor_id: mentorId,
          old_status: 'IN_PROGRESS',
          new_status: 'COMPLETED',
          reason: null,
          version: 3,
          occurred_at: t.endsAt,
        });
      }
      sessions.push({
        ...t,
        done: isDone,
        id: sessionId,
      });
    }
    units2.push({ id: unitId, done, lastEnd });
  }

  const buy = async (
    key: string,
    status: 'PAID' | 'PENDING' | 'EXPIRED',
    type: 'CASH' | 'PAYOS',
    createdAt: Date,
  ): Promise<string> => {
    const studentId = id(ctx.users, key);
    const orderCode = `SEED-${seed.code}-${key}`.toUpperCase();
    const paidAt = status === 'PAID' ? new Date(createdAt.getTime() + 10 * 60_000) : null;
    const orderId = await ins(m, 'orders', {
      student_id: studentId,
      order_code: orderCode,
      total_amount: price,
      status,
      payment_type: type,
      cash_mentor_id: type === 'CASH' ? mentorId : null,
      expires_at: new Date(createdAt.getTime() + (type === 'CASH' ? 48 * HOUR : 15 * 60_000)),
      paid_at: paidAt,
      created_at: createdAt,
    });
    const detailId = await ins(m, 'order_details', {
      order_id: orderId,
      class_id: classId,
      course_title_snapshot: course.title,
      class_name_snapshot: seed.name,
      price_snapshot: price,
      total_amount: price,
      created_at: createdAt,
    });
    if (paidAt) {
      // Same evidence shape the attendance payment check verifies.
      const eventKey = sha256(`seed:${orderCode}`);
      const paymentId = await ins(m, 'payment_transactions', {
        order_id: orderId,
        amount: price,
        status: 'SUCCEEDED',
        reference_code: type === 'CASH' ? `cash-manager:${ctx.managerId}:${orderId}` : eventKey,
        paid_at: paidAt,
        created_at: createdAt,
      });
      if (type === 'PAYOS') {
        const providerCode = await ins(
          m,
          'payos_payment_details',
          {
            payment_transaction_id: paymentId,
            channel_key: 'seed',
            payment_link_id: `seed-${orderCode}`,
          },
          'payos_order_code',
        );
        await ins(m, 'payment_webhook_events', {
          event_key: eventKey,
          fingerprint: sha256(`seed-fingerprint:${orderCode}`),
          payment_id: paymentId,
          provider_order_code: providerCode,
          reference_code: `FT${orderCode}`.slice(0, 150),
          payment_link_id: `seed-${orderCode}`,
          amount: price,
          currency: 'VND',
          result_code: '00',
          source: 'WEBHOOK',
          outcome: 'SETTLED',
          created_at: paidAt,
        });
      }
    }
    const enrollmentId = await ins(m, 'enrollments', {
      student_id: studentId,
      class_id: classId,
      order_detail_id: detailId,
      status: status === 'PAID' ? 'ACTIVE' : status === 'PENDING' ? 'PENDING_PAYMENT' : 'CANCELLED',
      enrolled_at: paidAt,
      created_at: createdAt,
    });
    await m.query(
      'UPDATE class_opening_enrollment_events SET effective_at=$2 WHERE enrollment_id=$1',
      [enrollmentId, paidAt ?? createdAt],
    );
    return enrollmentId;
  };

  // Started classes were bought a week before the first session; open classes in the last days.
  const buyBase = started ? first.startsAt.getTime() - 7 * DAY : now.getTime() - 3 * DAY;
  const enrollments: string[] = [];
  for (const [i, key] of seed.students.entries()) {
    const enrollmentId = await buy(
      key,
      'PAID',
      i % 2 ? 'PAYOS' : 'CASH',
      new Date(buyBase + i * HOUR),
    );
    enrollments.push(enrollmentId);
    for (const unit of units2) {
      const pct = (unit.done / SESSIONS_PER_UNIT) * 100;
      await ins(m, 'class_unit_progress', {
        enrollment_id: enrollmentId,
        class_unit_id: unit.id,
        status: pct === 100 ? 'COMPLETED' : pct > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
        progress_percent: pct,
        completed_at: pct === 100 ? unit.lastEnd : null,
      });
    }
  }
  for (const key of seed.pendingCash ?? [])
    await buy(key, 'PENDING', 'CASH', new Date(now.getTime() - HOUR));
  for (const key of seed.expiredPayos ?? [])
    await buy(key, 'EXPIRED', 'PAYOS', new Date(now.getTime() - 3 * DAY));
  for (const key of seed.inCart ?? []) {
    const cartId = await ins(m, 'carts', { student_id: id(ctx.users, key) });
    await ins(m, 'cart_details', { cart_id: cartId, class_id: classId, price_snapshot: price });
  }

  if (started) {
    await m.query(
      `INSERT INTO class_opening_decisions(class_id,scheduled_start_at,active_student_count,outcome,decided_at)
      VALUES($1,$2,$3,'STARTED',$2)`,
      [classId, first.startsAt, enrollments.length],
    );
    // Mostly present; a deterministic sprinkle of absences for attendance reports.
    for (const [si, s] of sessions.entries())
      if (s.done)
        for (const [ei, enrollmentId] of enrollments.entries()) {
          const present = (si + ei) % 7 !== 0;
          const checkedInAt = present ? new Date(s.startsAt.getTime() + 5 * 60_000) : null;
          const attendanceId = await ins(m, 'attendance_records', {
            class_id: classId,
            enrollment_id: enrollmentId,
            session_id: s.id,
            status: present ? 'PRESENT' : 'ABSENT',
            checked_in_at: checkedInAt,
            recorded_by: mentorId,
            admitted_at: s.startsAt,
            admission_source: 'START',
          });
          await ins(m, 'attendance_audits', {
            id: randomUUID(),
            attendance_id: attendanceId,
            actor_id: mentorId,
            old_status: 'UNMARKED',
            new_status: present ? 'PRESENT' : 'ABSENT',
            reason: null,
            action: 'MARK',
            version: 2,
            occurred_at: checkedInAt ?? s.startsAt,
          });
        }
  }

  if (seed.status === ClassStatus.IN_PROGRESS && seed.courseCode === 'JS-101')
    await seedQuizzes(m, sessions, enrollments, ctx, mentorId, classId, units[0]?.id);
  return `${seed.code}: ${seed.status}, ${sessions.length} buổi (${sessions.filter((s) => s.done).length} đã dạy), ${enrollments.length} học viên`;
}

/** A graded quiz on a taught session, an open quiz on the next one, and a material in review. */
async function seedQuizzes(
  m: EntityManager,
  sessions: readonly { id: string; startsAt: Date; endsAt: Date; done: boolean }[],
  enrollments: readonly string[],
  ctx: Ctx,
  mentorId: string,
  classId: string,
  firstCourseUnitId: string | undefined,
): Promise<void> {
  const taught = sessions[1];
  const next = sessions.find((s) => s.startsAt > ctx.now);
  if (!taught?.done || !next || !firstCourseUnitId) throw new Error('Quiz plan invariant');
  const create = async (
    session: { id: string; endsAt: Date },
    title: string,
    purpose: 'HOMEWORK' | 'TEST',
    dueAt: Date,
  ) => {
    const publishedAt = session.endsAt < ctx.now ? session.endsAt : ctx.now;
    const assignmentId = await ins(m, 'assignments', {
      session_id: session.id,
      purpose,
      type: 'QUIZ',
      title,
      description: '5 câu trắc nghiệm, mỗi câu 2 điểm.',
      max_score: 10,
      due_at: dueAt,
      time_limit_minutes: 30,
      status: 'PUBLISHED',
      revision: 2,
      created_by: mentorId,
      published_at: publishedAt,
    });
    await insAssignmentAudit(m, assignmentId, mentorId, 'CREATE', 1, publishedAt);
    await insAssignmentAudit(m, assignmentId, mentorId, 'PUBLISH', 2, publishedAt);
    const questions = [];
    for (const [i, q] of QUIZ.entries()) {
      const options = q.options.map((text, o) => ({ label: LABELS[o] ?? 'A', text }));
      questions.push({
        id: await ins(m, 'assignment_questions', {
          assignment_id: assignmentId,
          position: i + 1,
          prompt: q.prompt,
          options: JSON.stringify(options),
          correct_option: q.correct,
        }),
        position: i + 1,
        prompt: q.prompt,
        options,
      });
    }
    return { assignmentId, questions };
  };

  const graded = await create(
    taught,
    'Quiz buổi 2: cú pháp cơ bản',
    'HOMEWORK',
    new Date(taught.endsAt.getTime() + 3 * DAY),
  );
  const keys = new Map(graded.questions.map((q, i) => [q.id, QUIZ[i]?.correct ?? 'A']));
  for (const [ei, enrollmentId] of enrollments.slice(0, 8).entries()) {
    // Student ei misses question ei % 5 when ei is even, otherwise answers everything right.
    const answers = graded.questions.map((q, qi) => {
      const correct = keys.get(q.id) ?? 'A';
      const wrong = ei % 2 === 0 && qi === ei % 5;
      return { questionId: q.id, selectedOption: wrong ? (correct === 'A' ? 'B' : 'A') : correct };
    });
    const startedAt = new Date(taught.endsAt.getTime() + DAY + ei * HOUR);
    const [enrollment]: { student_id: string }[] = await m.query(
      'SELECT student_id FROM enrollments WHERE id=$1',
      [enrollmentId],
    );
    const submittedAt = new Date(startedAt.getTime() + 15 * 60_000);
    const submissionId = await ins(m, 'assignment_submissions', {
      assignment_id: graded.assignmentId,
      student_id: enrollment?.student_id,
      enrollment_id: enrollmentId,
      assignment_revision: 2,
      status: 'GRADED',
      started_at: startedAt,
      expires_at: new Date(startedAt.getTime() + 30 * 60_000),
      submitted_at: submittedAt,
      submission_source: 'MANUAL',
      assignment_snapshot: JSON.stringify({
        title: 'Quiz buổi 2: cú pháp cơ bản',
        maxScore: '10.00',
        questions: graded.questions,
      }),
      answers: JSON.stringify(answers),
      result: JSON.stringify(gradeQuiz(graded.questions, answers, keys, '10.00')),
    });
    await insAssignmentAudit(
      m,
      graded.assignmentId,
      enrollment?.student_id ?? null,
      'SUBMIT',
      2,
      submittedAt,
      submissionId,
    );
  }
  await create(next, 'Kiểm tra giữa khoá', 'TEST', new Date(next.endsAt.getTime() + 7 * DAY));

  // Mentor-submitted article waiting in the manager review queue.
  const pendingMaterialId = await ins(m, 'materials', {
    course_unit_id: firstCourseUnitId,
    content_type: 'ARTICLE',
    content_html: sanitizeArticle('<p>Bài tập bổ sung về biến và kiểu dữ liệu, kèm lời giải.</p>')
      .contentHtml,
    content_schema_version: 1,
    title: 'Bài tập bổ sung chương 1',
    created_by: mentorId,
    created_in_class_id: classId,
    review_status: 'PENDING_REVIEW',
  });
  await ins(m, 'material_audit_events', {
    id: randomUUID(),
    material_id: pendingMaterialId,
    actor_id: mentorId,
    action: 'SUBMIT',
    revision: 1,
    occurred_at: ctx.now,
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_CONFIRM !== 'YES')
    throw new Error('Demo data is not seeded in production unless SEED_DEMO_CONFIRM=YES');
  const password = process.env.SEED_ACCOUNT_PASSWORD?.trim();
  if (!password) throw new Error('SEED_ACCOUNT_PASSWORD is required');
  const passwordHash = await new PasswordService().hashPassword(password);
  const now = new Date();

  await dataSource.initialize();
  try {
    const lines = await dataSource.transaction(async (m) => {
      const users = new Map<string, string>();
      for (const [email, name, role] of STAFF)
        users.set(email, await upsertUser(m, email, name, role, UserStatus.ACTIVE, passwordHash));
      for (const [key, name] of Object.entries(STUDENTS))
        users.set(
          key,
          await upsertUser(
            m,
            `student.${key}@example.com`,
            name,
            UserRole.STUDENT,
            UserStatus.ACTIVE,
            passwordHash,
          ),
        );
      await upsertUser(
        m,
        'student.suspended@example.com',
        'Tài khoản bị khoá',
        UserRole.STUDENT,
        UserStatus.SUSPENDED,
        passwordHash,
      );
      const ctx: Ctx = { now, users, managerId: id(users, 'manager.ops@example.com') };
      await seedCatalog(m, ctx.managerId, now);
      const result: string[] = [];
      for (const seed of CLASSES) result.push(await seedClass(m, seed, ctx));
      return result;
    });
    console.log(
      `Standard seed done (${STAFF.length} staff, ${Object.keys(STUDENTS).length + 1} students):\n  ${lines.join('\n  ')}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

await main();
