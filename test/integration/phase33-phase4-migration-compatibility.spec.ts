import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource, type MigrationInterface } from 'typeorm';
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
import { PayosPayments1791158400000 } from '../../src/database/migrations/1791158400000-payos-payments.js';
import { RestoreManagerRole1791504000000 } from '../../src/database/migrations/1791504000000-restore-manager-role.js';
import { PrivateFileUploads1791504000001 } from '../../src/database/migrations/1791504000001-private-file-uploads.js';
import { StudentMaterialReads1791763200000 } from '../../src/database/migrations/1791763200000-student-material-reads.js';
import { PrepareReleaseUnitConstraint1791849599999 } from '../../src/database/migrations/1791849599999-prepare-release-unit-constraint.js';
import { SessionMentorAssignment1791849600000 } from '../../src/database/migrations/1791849600000-session-mentor-assignment.js';
import { TypedManagerMaterials1791849600000 } from '../../src/database/migrations/1791849600000-typed-manager-materials.js';
import { SessionAttendance1791849600001 } from '../../src/database/migrations/1791849600001-session-attendance.js';
import { CalendarAttendanceDeadline1791849600002 } from '../../src/database/migrations/1791849600002-calendar-attendance-deadline.js';
import { AttendanceRecoveryEvidence1791849600003 } from '../../src/database/migrations/1791849600003-attendance-recovery-evidence.js';
import { MaterialPublicationWithdrawal1791853200000 } from '../../src/database/migrations/1791853200000-material-publication-withdrawal.js';
import { IsolateAttendanceUnitConstraint1791856799999 } from '../../src/database/migrations/1791856799999-isolate-attendance-unit-constraint.js';
import { ClassUnitReleaseAudit1791856800000 } from '../../src/database/migrations/1791856800000-class-unit-release-audit.js';
import { SessionScheduleOperations1792022400000 } from '../../src/database/migrations/1792022400000-session-schedule-operations.js';
import { CrossClassMakeup1792022400001 } from '../../src/database/migrations/1792022400001-cross-class-makeup.js';
import { separateTestUrl } from '../helpers/payment-fixture.js';

type MigrationClass = new () => MigrationInterface;

const common: readonly MigrationClass[] = [
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
  PrivateFileUploads1791504000001,
  StudentMaterialReads1791763200000,
];

const phase4: readonly MigrationClass[] = [
  SessionMentorAssignment1791849600000,
  SessionAttendance1791849600001,
  CalendarAttendanceDeadline1791849600002,
  AttendanceRecoveryEvidence1791849600003,
];

const materials: readonly MigrationClass[] = [
  TypedManagerMaterials1791849600000,
  MaterialPublicationWithdrawal1791853200000,
  ClassUnitReleaseAudit1791856800000,
];

const bridges: readonly MigrationClass[] = [
  PrepareReleaseUnitConstraint1791849599999,
  IsolateAttendanceUnitConstraint1791856799999,
];

const all = [...common, ...phase4, ...materials, ...bridges];
const current: readonly MigrationClass[] = [
  ...all,
  SessionScheduleOperations1792022400000,
  CrossClassMakeup1792022400001,
];

describe.skipIf(!separateTestUrl('merge_migrations'))(
  'Phase 3.3 / Phase 4 migration compatibility',
  () => {
    let admin: DataSource;
    const connections: DataSource[] = [];
    beforeAll(async () => {
      admin = new DataSource({ type: 'postgres', url: process.env.TEST_DATABASE_URL });
      await admin.initialize();
    });
    afterAll(async () => {
      for (const db of connections) if (db.isInitialized) await db.destroy();
      if (admin?.isInitialized) await admin.destroy();
    });

    async function createDatabase(suffix: string): Promise<string> {
      const url = separateTestUrl(
        `merge_${suffix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      );
      const name = new URL(url).pathname.slice(1);
      if (!/^\w+_test$/.test(name) || name.length > 63)
        throw new Error('Dedicated test database within PostgreSQL identifier bounds required');
      await admin.query(`CREATE DATABASE "${name}"`);
      return url;
    }

    async function connect(
      url: string,
      migrations: readonly MigrationClass[],
    ): Promise<DataSource> {
      const db = new DataSource({
        type: 'postgres',
        url,
        migrations: [...migrations],
        synchronize: false,
      });
      connections.push(db);
      await db.initialize();
      return db;
    }

    async function assertCombined(db: DataSource): Promise<void> {
      const rows: { name: string }[] = await db.query('SELECT name FROM migrations');
      expect(rows.map((row) => row.name).sort()).toEqual(
        all.map((migration) => new migration().name ?? migration.name).sort(),
      );
      expect(await db.showMigrations()).toBe(false);
      const sameTime: { count: string }[] = await db.query(
        'SELECT count(*) FROM migrations WHERE timestamp = 1791849600000',
      );
      expect(sameTime[0]?.count).toBe('2');
      const refs: { conname: string; index_name: string }[] = await db.query(
        `SELECT fk.conname, idx.relname AS index_name FROM pg_constraint fk
       JOIN pg_class idx ON idx.oid = fk.conindid
       WHERE fk.conname IN ('fk_class_sessions_unit_class', 'fk_class_unit_release_audit_unit')
       ORDER BY fk.conname`,
      );
      expect(refs.map((ref) => ref.conname)).toEqual([
        'fk_class_sessions_unit_class',
        'fk_class_unit_release_audit_unit',
      ]);
      // PostgreSQL may bind a new FK to either equivalent unique index; both must stay valid.
      for (const ref of refs)
        expect(['uq_class_units_attendance_context', 'uq_class_units_id_class']).toContain(
          ref.index_name,
        );
      const constraints: { conname: string }[] = await db.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'class_units'::regclass
         AND conname IN ('uq_class_units_attendance_context', 'uq_class_units_id_class')
         AND contype = 'u' ORDER BY conname`,
      );
      expect(constraints.map((row) => row.conname)).toEqual([
        'uq_class_units_attendance_context',
        'uq_class_units_id_class',
      ]);
    }

    it('runs all migrations from empty and rehearses release/bridge down-up without breaking attendance FKs', async () => {
      const db = await connect(await createDatabase('empty'), all);
      expect(await db.runMigrations()).toHaveLength(22);
      await assertCombined(db);
      await db.undoLastMigration();
      await db.undoLastMigration();
      expect(
        await db.query(
          `SELECT 1 FROM pg_constraint WHERE conname = 'fk_class_sessions_unit_class'`,
        ),
      ).toHaveLength(1);
      expect(await db.runMigrations()).toHaveLength(2);
      await assertCombined(db);
    }, 30000);

    it('runs the current 24-migration catalog from empty, then safely replays Phase 4.4', async () => {
      const db = await connect(await createDatabase('catalog'), current);
      expect(await db.runMigrations()).toHaveLength(24);
      expect(await db.showMigrations()).toBe(false);
      expect(await db.runMigrations()).toHaveLength(0);
      await db.undoLastMigration();
      await db.undoLastMigration();
      expect(await db.runMigrations()).toHaveLength(2);
      expect(await db.showMigrations()).toBe(false);
      const history: { name: string }[] = await db.query('SELECT name FROM migrations');
      expect(history.map((row) => row.name).sort()).toEqual(
        current.map((migration) => new migration().name ?? migration.name).sort(),
      );
    }, 30000);

    it('upgrades the latest dev catalog to the current branch without changing existing material or release data', async () => {
      const url = await createDatabase('dev_upgrade');
      const old = await connect(url, all);
      expect(await old.runMigrations()).toHaveLength(22);
      const user = await old.query(
        `INSERT INTO users(email,display_name,role) VALUES($1,'Upgrade marker','MANAGER') RETURNING id`,
        [`${randomUUID()}@merge.test`],
      );
      const category = await old.query(
        "INSERT INTO course_categories(name,slug) VALUES('Upgrade category',$1) RETURNING id",
        [randomUUID()],
      );
      const course = await old.query(
        "INSERT INTO courses(category_id,code,title,price_amount) VALUES($1,$2,'Upgrade course',1000) RETURNING id",
        [category[0].id, randomUUID()],
      );
      const unit = await old.query(
        "INSERT INTO course_units(course_id,unit_number,title) VALUES($1,1,'Upgrade unit') RETURNING id",
        [course[0].id],
      );
      const material = await old.query(
        `INSERT INTO materials(course_unit_id,content_type,title,content_html,content_schema_version,created_by)
        VALUES($1,'ARTICLE','Preserved lesson','<p>Existing CKEditor lesson</p>',1,$2) RETURNING *`,
        [unit[0].id, user[0].id],
      );
      const constraints = await old.query(
        "SELECT conname,conindid::text FROM pg_constraint WHERE conrelid='class_units'::regclass AND contype='u' ORDER BY conname",
      );
      await old.destroy();
      const db = await connect(url, current);
      expect(await db.runMigrations()).toHaveLength(2);
      expect(await db.showMigrations()).toBe(false);
      expect(await db.query('SELECT * FROM materials WHERE id=$1', [material[0].id])).toEqual(
        material,
      );
      expect(
        await db.query(
          "SELECT conname,conindid::text FROM pg_constraint WHERE conrelid='class_units'::regclass AND contype='u' ORDER BY conname",
        ),
      ).toEqual(constraints);
      expect(await db.runMigrations()).toHaveLength(0);
    }, 30000);

    it.each(['materials', 'phase4'] as const)(
      'upgrades existing %s history, preserves data/FK indexes, and replays the last bridge or release safely',
      async (baseline) => {
        const initial = [...common, ...(baseline === 'materials' ? materials : phase4)];
        const url = await createDatabase(baseline);
        const old = await connect(url, initial);
        expect(await old.runMigrations()).toHaveLength(initial.length);
        const marker = await old.query(
          `INSERT INTO users(email,display_name,role) VALUES($1,'Migration marker','MANAGER')
         RETURNING id,email,role,created_at,updated_at`,
          [`${randomUUID()}@merge.test`],
        );
        const foreignKey =
          baseline === 'materials'
            ? 'fk_class_unit_release_audit_unit'
            : 'fk_class_sessions_unit_class';
        const indexBefore = await old.query(
          'SELECT conindid::text FROM pg_constraint WHERE conname = $1',
          [foreignKey],
        );
        await old.destroy();
        const db = await connect(url, all);
        expect(await db.runMigrations()).toHaveLength(all.length - initial.length);
        await assertCombined(db);
        expect(await db.query('SELECT id,email,role,created_at,updated_at FROM users')).toEqual(
          marker,
        );
        expect(
          await db.query('SELECT conindid::text FROM pg_constraint WHERE conname = $1', [
            foreignKey,
          ]),
        ).toEqual(indexBefore);
        await db.undoLastMigration();
        expect(await db.runMigrations()).toHaveLength(1);
        await assertCombined(db);
      },
      30000,
    );
  },
);
