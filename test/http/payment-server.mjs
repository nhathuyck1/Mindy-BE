// Test-only process: compiled Nest runtime, real guards/signature verifier, fake network provider.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

if (
  process.env.NODE_ENV !== 'test' ||
  !/\/\w+_http_test$/.test(new URL(process.env.DATABASE_URL).pathname)
)
  throw new Error('HTTP fixture requires a dedicated _http_test database');
const admin = new DataSource({ type: 'postgres', url: process.env.TEST_DATABASE_URL });
await admin.initialize();
const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).length)
  await admin.query(`CREATE DATABASE "${dbName}"`);
await admin.destroy();
const { default: migrationDb } = await import('../../dist/database/data-source.js');
await migrationDb.initialize();
await migrationDb.query('DROP SCHEMA public CASCADE');
await migrationDb.query('CREATE SCHEMA public');
await migrationDb.runMigrations();
await migrationDb.destroy();
const { AppModule } = await import('../../dist/app.module.js');
const { configureApp } = await import('../../dist/configure-app.js');
const { PayosAdapter } = await import('../../dist/modules/payments/adapters/payos.adapter.js');
const { PAYOS_PROVIDER } = await import('../../dist/modules/payments/domain/payos-provider.js');
const { UsersService } = await import('../../dist/modules/users/users.service.js');
const { PasswordService } = await import('../../dist/modules/auth/services/password.service.js');
const { CourseCategoriesService } = await import(
  '../../dist/modules/catalog/services/course-categories.service.js'
);
const { CoursesService } = await import('../../dist/modules/catalog/services/courses.service.js');
const { ClassesService } = await import('../../dist/modules/classes/services/classes.service.js');
const verifier = new PayosAdapter(
  new ConfigService({
    PAYOS_ENABLED: true,
    PAYOS_CLIENT_ID: 'http-client',
    PAYOS_API_KEY: 'http-key',
    PAYOS_CHECKSUM_KEY: 'http-checksum',
  }),
);
const remote = new Map();
const provider = {
  channelKey: verifier.channelKey,
  verify: (body) => verifier.verify(body),
  get: async (code) => remote.get(code) ?? null,
  create: async (code, amount) => {
    const link = {
      orderCode: code,
      amount,
      amountPaid: 0,
      id: randomUUID().replaceAll('-', ''),
      status: 'PENDING',
      checkoutUrl: 'https://pay.payos.vn/web/http-test',
      qrCode: 'test-qr',
      transactions: [],
    };
    remote.set(code, link);
    return link;
  },
};
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(PAYOS_PROVIDER)
  .useValue(provider)
  .compile();
const app = moduleRef.createNestApplication({ logger: ['error'], bodyParser: false });
configureApp(app);
const passwords = app.get(PasswordService);
const users = app.get(UsersService);
const hash = await passwords.hashPassword('Http-test-password1!');
for (const [email, role] of [
  ['student@http.test', 'STUDENT'],
  ['other@http.test', 'STUDENT'],
  ['cash@http.test', 'STUDENT'],
  ['learner@http.test', 'STUDENT'],
  ['admin@http.test', 'ADMIN'],
  ['mentor@http.test', 'MENTOR'],
])
  await users.createUser(
    { email, role, password: 'Http-test-password1!', displayName: role },
    hash,
  );
const mentor = await users.findAuthenticationIdentity('mentor@http.test');
const category = await app.get(CourseCategoriesService).create({ name: 'HTTP test category' });
const courses = app.get(CoursesService);
const { course } = await courses.create({
  code: 'HTTP-COURSE',
  categoryId: category.id,
  title: 'HTTP course',
  priceAmount: 5000,
});
await courses.addUnit(course.id, { title: 'Unit one' });
await courses.activate(course.id);
const classes = app.get(ClassesService);
const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const view = await classes.create({
  code: 'HTTP-CLASS',
  courseId: course.id,
  mentorId: mentor.id,
  name: 'HTTP class',
  deliveryMode: 'ONLINE',
  startDate: date,
  endDate: date,
  maxStudents: 10,
  meetingUrl: 'https://meet.example.test/paid-class',
});
await classes.scheduleSession(view.classEntity.id, {
  classUnitId: view.units[0].unit.id,
  title: 'Session',
  startsAt: `${date}T08:00:00+07:00`,
  endsAt: `${date}T09:00:00+07:00`,
  meetingUrl: 'https://meet.example.test/paid-session',
});
await classes.open(view.classEntity.id);
await app.listen(0, '127.0.0.1');
process.send?.({ url: await app.getUrl(), classId: view.classEntity.id });
process.on('message', async (msg) => {
  if (msg === 'close') {
    await app.close();
    process.exit(0);
  }
});
