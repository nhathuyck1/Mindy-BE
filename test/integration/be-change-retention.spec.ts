import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrivateFileUploads1791504000001 } from '../../src/database/migrations/1791504000001-private-file-uploads.js';
import { StudentMaterialReads1791763200000 } from '../../src/database/migrations/1791763200000-student-material-reads.js';
import { TypedManagerMaterials1791849600000 } from '../../src/database/migrations/1791849600000-typed-manager-materials.js';
import { MaterialRetention1793836800001 } from '../../src/database/migrations/1793836800001-material-retention.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { CoursesService } from '../../src/modules/catalog/services/courses.service.js';
import { ClassUnitEntity } from '../../src/modules/classes/entities/class-unit.entity.js';
import { ClassContentContextService } from '../../src/modules/classes/services/class-content-context.service.js';
import { MentorContentContextService } from '../../src/modules/classes/services/mentor-content-context.service.js';
import { FileMetadataEntity } from '../../src/modules/files/entities/file-metadata.entity.js';
import { FileObjectEntity } from '../../src/modules/files/entities/file-object.entity.js';
import { FileProcessingJobEntity } from '../../src/modules/files/entities/file-processing-job.entity.js';
import { FileUploadPolicyService } from '../../src/modules/files/services/file-upload-policy.service.js';
import { FilesService } from '../../src/modules/files/services/files.service.js';
import { MaterialFileCleanupService } from '../../src/modules/files/services/material-file-cleanup.service.js';
import {
  MaterialContentType,
  MaterialEntity,
} from '../../src/modules/materials/entities/material.entity.js';
import { MaterialAuditEventEntity } from '../../src/modules/materials/entities/material-audit-event.entity.js';
import { MaterialFileReferenceEntity } from '../../src/modules/materials/entities/material-file-reference.entity.js';
import { MaterialAuthoringService } from '../../src/modules/materials/services/material-authoring.service.js';
import { MaterialPolicyService } from '../../src/modules/materials/services/material-policy.service.js';
import { MaterialRetentionService } from '../../src/modules/materials/services/material-retention.service.js';
import { MaterialRetentionWorker } from '../../src/modules/materials/services/material-retention.worker.js';
import { StudentMaterialsService } from '../../src/modules/materials/services/student-materials.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { fileConfig, storageFixture } from '../helpers/files-fixture.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('retention'))(
  'BE Change material retention PostgreSQL + MinIO',
  () => {
    let testBucket = '';
    let db: DataSource,
      f: ReturnType<typeof paymentFixture>,
      remote: Awaited<ReturnType<typeof storageFixture>>,
      authoring: MaterialAuthoringService,
      retention: MaterialRetentionService,
      cleanup: MaterialFileCleanupService,
      manager: AuthenticatedUser;
    beforeAll(async () => {
      db = await paymentDatabase('retention', {
        entities: [
          FileObjectEntity,
          FileMetadataEntity,
          FileProcessingJobEntity,
          MaterialEntity,
          MaterialAuditEventEntity,
          MaterialFileReferenceEntity,
        ],
        migrations: [
          PrivateFileUploads1791504000001,
          StudentMaterialReads1791763200000,
          TypedManagerMaterials1791849600000,
        ],
      });
      f = paymentFixture(db);
      const u = await f.user(UserRole.MANAGER);
      manager = { userId: u.id, role: u.role, sessionId: randomUUID() };
      const config = fileConfig(),
        courses = new CoursesService(db),
        contexts = new ClassContentContextService(db),
        uploads = new FileUploadPolicyService(f.users, courses, contexts);
      remote = await storageFixture(config);
      testBucket = config.getOrThrow<string>('MINIO_BUCKET');
      const files = new FilesService(db, config, uploads, remote.storage),
        policy = new MaterialPolicyService(f.users, courses, contexts, f.enrollments, uploads);
      authoring = new MaterialAuthoringService(
        db,
        policy,
        files,
        courses,
        contexts,
        new MentorContentContextService(db, f.workspace, f.users, courses, contexts),
      );
      retention = new MaterialRetentionService(
        db,
        policy,
        new StudentMaterialsService(db, contexts, policy, files),
        authoring,
      );
      cleanup = new MaterialFileCleanupService(db, remote.storage);
    }, 60_000);
    afterAll(async () => {
      if (remote) await remote.cleanup();
      if (db?.isInitialized) await db.destroy();
    });
    async function fixture() {
      const a = await f.order({ maxStudents: 10 });
      const classId = a.classIds[0];
      if (!classId) throw new Error('Class missing');
      await db.query(
        "UPDATE enrollments SET status='ACTIVE',enrolled_at=clock_timestamp() WHERE class_id=$1 AND student_id=$2",
        [classId, a.student.id],
      );
      const unit = await db
        .getRepository(ClassUnitEntity)
        .findOneByOrFail({ classId, position: 1 });
      const student: AuthenticatedUser = {
          userId: a.student.id,
          role: UserRole.STUDENT,
          sessionId: randomUUID(),
        },
        mentor: AuthenticatedUser = {
          userId: a.mentor.id,
          role: UserRole.MENTOR,
          sessionId: randomUUID(),
        };
      return { classId, unit, student, mentor };
    }
    async function article(unitId: string) {
      const m = await authoring.create(manager, unitId, {
        contentType: MaterialContentType.ARTICLE,
        title: 'Tracked article',
        contentText: 'Kiến thức mới',
      });
      await authoring.review(manager, m.id, { action: 'APPROVE', expectedRevision: m.revision });
      return authoring.detail(manager, m.id);
    }
    it('rehearses clean down/up and starts tracking legacy material at migration time', async () => {
      const a = await fixture(),
        m = await article(a.unit.courseUnitId);
      const before = new Date();
      await rehearseMigration(db, new MaterialRetention1793836800001(), 'down');
      await rehearseMigration(db, new MaterialRetention1793836800001(), 'up');
      const row = await db.getRepository(MaterialEntity).findOneByOrFail({ id: m.id });
      expect(row.title).toBe(m.title);
      expect(row.lastSeenAt).toBeNull();
      expect(row.isUnseen).toBe(false);
      expect(row.trackingStartedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
    it('does not track manager/list reads; student/mentor open clear UNSEEN and invalidate bulk snapshots', async () => {
      const a = await fixture(),
        m = await article(a.unit.courseUnitId);
      await db.query(
        "UPDATE materials SET tracking_started_at=clock_timestamp()-interval '31 days',is_unseen=true WHERE id=$1",
        [m.id],
      );
      const old = await authoring.detail(manager, m.id);
      await authoring.list(manager, { page: 1, pageSize: 20 });
      expect((await authoring.detail(manager, m.id)).lastSeenAt).toBeNull();
      await expect(
        retention.opened(manager, m.id, { classId: a.classId, expectedRevision: 1 }),
      ).rejects.toMatchObject({ response: { code: 'MATERIAL_ACCESS_DENIED' } });
      await retention.opened(a.student, m.id, { classId: a.classId, expectedRevision: 1 });
      const first = await authoring.detail(manager, m.id);
      expect(first.isUnseen).toBe(false);
      expect(first.lastSeenAt).not.toBeNull();
      const result = await retention.bulkDelete(manager, {
        items: [
          {
            materialId: m.id,
            expectedRevision: old.revision,
            lastSeenAt: null,
            trackingStartedAt: old.trackingStartedAt.toISOString(),
          },
        ],
      });
      expect(result.items[0]?.status).toBe('STALE');
      await retention.opened(a.mentor, m.id, { classId: a.classId, expectedRevision: 1 });
      expect((await authoring.detail(manager, m.id)).lastSeenAt?.getTime()).toBeGreaterThan(
        first.lastSeenAt?.getTime() ?? 0,
      );
    });
    it('marks only material beyond the 30-day boundary without deleting it', async () => {
      const a = await fixture(),
        old = await article(a.unit.courseUnitId),
        recent = await article(a.unit.courseUnitId);
      await db.query(
        "UPDATE materials SET tracking_started_at=clock_timestamp()-interval '30 days'-interval '1 second',last_seen_at=NULL,is_unseen=false WHERE id=$1",
        [old.id],
      );
      await db.query(
        "UPDATE materials SET tracking_started_at=clock_timestamp()-interval '30 days'+interval '1 hour',last_seen_at=NULL,is_unseen=false WHERE id=$1",
        [recent.id],
      );
      const worker = new MaterialRetentionWorker(
        db,
        fileConfig({ MATERIAL_TRACKING_JOB_ENABLED: true, MATERIAL_CLEANUP_JOB_ENABLED: false }),
        cleanup,
      );
      await worker.run();
      expect(await db.getRepository(MaterialEntity).findOneByOrFail({ id: old.id })).toMatchObject({
        isUnseen: true,
        deletedAt: null,
      });
      expect(
        (await db.getRepository(MaterialEntity).findOneByOrFail({ id: recent.id })).isUnseen,
      ).toBe(false);
    });
    it('retains shared files, fences rebinding, recovers failed deletion and removes all versions', async () => {
      const a = await fixture();
      const key = `verified/${randomUUID()}`,
        staging = `staging/${randomUUID()}`;
      const bucketName = testBucket;
      const bytes = Buffer.from('verified test bytes');
      const firstVersion = await remote.storage.put(bucketName, key, bytes, 'application/pdf');
      const version = await remote.storage.put(bucketName, key, bytes, 'application/pdf');
      const stagingVersion = await remote.storage.put(
        bucketName,
        staging,
        bytes,
        'application/pdf',
      );
      const file = await db.getRepository(FileObjectEntity).save({
        ownerUserId: manager.userId,
        courseUnitId: a.unit.courseUnitId,
        bucket: bucketName,
        stagingKey: staging,
        stagingVersionId: stagingVersion,
        objectKey: key,
        objectVersionId: version,
        originalName: 'lesson.pdf',
        extension: '.pdf',
        declaredMimeType: 'application/pdf',
        declaredSizeBytes: String(bytes.length),
        mimeType: 'application/pdf',
        sizeBytes: String(bytes.length),
        kind: 'PDF',
        sha256: 'a'.repeat(64),
        status: 'READY',
        intentExpiresAt: new Date(),
        readyAt: new Date(),
      });
      const one = await authoring.create(manager, a.unit.courseUnitId, {
          contentType: MaterialContentType.FILE,
          title: 'Shared one',
          fileId: file.id,
        }),
        two = await authoring.create(manager, a.unit.courseUnitId, {
          contentType: MaterialContentType.FILE,
          title: 'Shared two',
          fileId: file.id,
        });
      await authoring.delete(manager, one.id, one.revision);
      await cleanup.runOne();
      expect(
        (
          await db.query('SELECT status FROM material_file_cleanup_jobs WHERE file_id=$1', [
            file.id,
          ])
        )[0].status,
      ).toBe('SKIPPED');
      expect(await remote.storage.head(bucketName, key, firstVersion)).toMatchObject({
        size: bytes.length,
      });
      const snapshot = await authoring.detail(manager, two.id);
      expect(
        (
          await retention.bulkDelete(manager, {
            items: [
              {
                materialId: two.id,
                expectedRevision: two.revision,
                lastSeenAt: null,
                trackingStartedAt: snapshot.trackingStartedAt.toISOString(),
              },
            ],
          })
        ).items[0]?.status,
      ).toBe('DELETED');
      const fail = vi
        .spyOn(remote.storage, 'deleteAllVersions')
        .mockRejectedValueOnce(new Error('storage offline'));
      await cleanup.runOne();
      expect(
        (
          await db.query('SELECT status FROM material_file_cleanup_jobs WHERE file_id=$1', [
            file.id,
          ])
        )[0].status,
      ).toBe('PENDING');
      await expect(
        authoring.create(manager, a.unit.courseUnitId, {
          contentType: MaterialContentType.FILE,
          title: 'Cannot rebind',
          fileId: file.id,
        }),
      ).rejects.toThrow();
      await db.query(
        'UPDATE material_file_cleanup_jobs SET available_at=clock_timestamp() WHERE file_id=$1',
        [file.id],
      );
      await cleanup.runOne();
      fail.mockRestore();
      expect(
        (
          await db.query(
            'SELECT status,reclaimed_bytes FROM material_file_cleanup_jobs WHERE file_id=$1',
            [file.id],
          )
        )[0],
      ).toEqual({ status: 'DONE', reclaimed_bytes: String(bytes.length * 3) });
      await expect(remote.storage.head(bucketName, key, firstVersion)).rejects.toThrow();
      await expect(remote.storage.head(bucketName, key, version)).rejects.toThrow();
      expect(BigInt((await retention.cleanupStats(manager)).reclaimedBytes)).toBeGreaterThan(0n);
    });
  },
);
