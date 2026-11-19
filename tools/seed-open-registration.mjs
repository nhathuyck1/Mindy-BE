// Run from /app in the ALREADY DEPLOYED backend container. No build or CI/CD needed.
// Inserts only OPEN classes, their units, sessions and weekly schedules.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const built = (path) => import(pathToFileURL(resolve('dist', path)).href);
const { weeklySchedule } = await built('modules/classes/domain/weekly-schedule.js');
const { toLocalDate } = await built('modules/classes/domain/class-calendar.js');
const zone = 'Asia/Ho_Chi_Minh';
const offlineBatch = process.argv.includes('--offline');
const startDate = process.env.SEED_REGISTRATION_START_DATE || '2026-11-23';
const parsedDate = new Date(`${startDate}T00:00:00Z`);
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
  !Number.isFinite(parsedDate.getTime()) ||
  parsedDate.toISOString().slice(0, 10) !== startDate
)
  throw new Error('SEED_REGISTRATION_START_DATE must be YYYY-MM-DD');

const rows = offlineBatch
  ? [
      ['HTML-CSS-101', 'FE', 'frontend', [1, 4], 2],
      ['JS-101', 'FE', 'frontend', [3, 6], 2],
      ['REACT-201', 'FE', 'frontend', [3, 5], 3],
      ['JS-101', 'BE', 'backend', [1, 4], 2],
      ['NODE-201', 'BE', 'backend', [3, 6], 2],
    ]
  : [
      ['HTML-CSS-101', 'FE', 'frontend', [1, 4], 1],
      ['JS-101', 'FE', 'frontend', [2, 5], 1],
      ['REACT-201', 'FE', 'frontend', [3, 6], 1],
      ['JS-101', 'BE', 'backend', [2, 5], 1],
      ['NODE-201', 'BE', 'backend', [4, 7], 1],
      ['PY-101', 'PY', 'python', [3, 6], 1],
    ];
const definitions = rows.map(([courseCode, track, mentor, weekdays, slotId]) => ({
  courseCode,
  code: `${courseCode}-${track}-REG-${offlineBatch ? 'OFF-' : ''}${startDate.replaceAll('-', '')}`,
  mentorEmail: `mentor.${mentor}@example.com`,
  weeklySlots: weekdays.map((weekday) => ({ weekday, slotId })),
  deliveryMode: offlineBatch || courseCode === 'PY-101' ? 'OFFLINE' : 'ONLINE',
  roomName: offlineBatch
    ? `Phòng Demo ${track === 'FE' ? 'Frontend' : 'Backend'}`
    : courseCode === 'PY-101'
      ? 'Phòng Lab 3'
      : null,
}));

if (process.argv.includes('--plan')) {
  console.log(
    JSON.stringify(
      {
        startDate,
        status: 'OPEN',
        capacity: 25,
        enrolled: 0,
        classes: definitions.map((seed) => ({
          ...seed,
          firstSession: weeklySchedule(startDate, seed.weeklySlots, 1, zone)[0],
        })),
      },
      null,
      2,
    ),
  );
} else {
  if (process.env.SEED_DEMO_CONFIRM !== 'YES')
    throw new Error('Set SEED_DEMO_CONFIRM=YES to add registration demo classes');
  if (startDate <= toLocalDate(new Date(), zone))
    throw new Error('Choose a future SEED_REGISTRATION_START_DATE');
  const { default: db } = await built('database/data-source.js');
  const { CalendarValidationService } = await built(
    'modules/classes/services/calendar-validation.service.js',
  );
  const { MentorConflictService } = await built(
    'modules/classes/services/mentor-conflict.service.js',
  );
  const { ScheduleReservationsService } = await built(
    'modules/schedule-reservations/schedule-reservations.service.js',
  );
  const calendar = new CalendarValidationService(
    new MentorConflictService(),
    new ScheduleReservationsService(),
  );
  const dryRun = process.argv.includes('--dry-run');
  const runner = db.createQueryRunner();
  const lines = [];
  await db.initialize();
  try {
    await runner.connect();
    await runner.startTransaction();
    const m = runner.manager;
    await m.query("SELECT pg_advisory_xact_lock(hashtextextended('mindy-demo-seed',0))");
    for (const seed of definitions) {
      const [existing] = await m.query('SELECT id FROM classes WHERE code=$1', [seed.code]);
      if (existing) {
        lines.push(`${seed.code}: already exists; preserved`);
        continue;
      }
      const [course] = await m.query(
        'SELECT id,title FROM courses WHERE code=$1 AND is_active=true',
        [seed.courseCode],
      );
      const [mentor] = await m.query(
        "SELECT id FROM users WHERE email=$1 AND role='MENTOR' AND status='ACTIVE'",
        [seed.mentorEmail],
      );
      if (!course || !mentor)
        throw new Error(`Missing active course/mentor: ${seed.courseCode}/${seed.mentorEmail}`);
      const units = await m.query(
        'SELECT id,title FROM course_units WHERE course_id=$1 ORDER BY unit_number',
        [course.id],
      );
      if (!units.length) throw new Error(`Course has no units: ${seed.courseCode}`);
      const times = weeklySchedule(startDate, seed.weeklySlots, units.length * 2, zone);
      const endDate = toLocalDate(times.at(-1).endsAt, zone);
      const offline = seed.deliveryMode === 'OFFLINE';
      const meetingUrl = offline
        ? null
        : `https://meet.google.com/mindy-${seed.code.toLowerCase()}`;
      const [created] = await m.query(
        `INSERT INTO classes(course_id,mentor_id,code,name,start_date,end_date,max_students,delivery_mode,meeting_url,status)
         VALUES($1,$2,$3,$4,$5,$6,25,$7,$8,'OPEN') RETURNING id`,
        [
          course.id,
          mentor.id,
          seed.code,
          `${course.title} — ${seed.deliveryMode} — Mở đăng ký ${seed.code.includes('-BE-') ? 'Backend' : seed.code.includes('-FE-') ? 'Frontend' : 'Python'} — Demo`,
          startDate,
          endDate,
          seed.deliveryMode,
          meetingUrl,
        ],
      );
      await m.query(
        'INSERT INTO class_weekly_schedules(class_id,start_date,weekly_slots) VALUES($1,$2,$3::jsonb)',
        [created.id, startDate, JSON.stringify(seed.weeklySlots)],
      );
      const targets = [];
      for (const [index, unit] of units.entries()) {
        const [classUnit] = await m.query(
          "INSERT INTO class_units(class_id,course_unit_id,position,status) VALUES($1,$2,$3,'OPEN') RETURNING id",
          [created.id, unit.id, index + 1],
        );
        for (let n = 0; n < 2; n += 1) {
          const time = times[index * 2 + n];
          const [session] = await m.query(
            `INSERT INTO class_sessions(class_unit_id,session_number,title,starts_at,ends_at,room_name,meeting_url,status)
             VALUES($1,$2,$3,$4,$5,$6,$7,'SCHEDULED') RETURNING id`,
            [
              classUnit.id,
              n + 1,
              `Buổi ${index * 2 + n + 1}: ${unit.title}`,
              time.startsAt,
              time.endsAt,
              seed.roomName,
              meetingUrl,
            ],
          );
          targets.push({
            sessionId: session.id,
            classId: created.id,
            mentorId: mentor.id,
            ...time,
          });
        }
      }
      await calendar.lock(m, created.id, [mentor.id]);
      const conflicts = await calendar.conflicts(m, targets);
      if (conflicts.length)
        throw new Error(
          `${seed.code}: schedule conflict; batch rolled back: ${JSON.stringify(conflicts)}`,
        );
      lines.push(
        `${seed.code}: OPEN ${seed.deliveryMode}, 0/25 students, ${times.length} sessions, ${startDate} -> ${endDate}${seed.roomName ? `, ${seed.roomName}` : ''}`,
      );
    }
    if (dryRun) await runner.rollbackTransaction();
    else await runner.commitTransaction();
    console.log(`${dryRun ? 'DRY RUN / ROLLED BACK' : 'COMMITTED'}\n${lines.join('\n')}`);
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
    await db.destroy();
  }
}
