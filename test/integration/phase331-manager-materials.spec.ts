import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrivateFileUploads1791504000001 } from '../../src/database/migrations/1791504000001-private-file-uploads.js';
import { StudentMaterialReads1791763200000 } from '../../src/database/migrations/1791763200000-student-material-reads.js';
import { TypedManagerMaterials1791849600000 } from '../../src/database/migrations/1791849600000-typed-manager-materials.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { CoursesService } from '../../src/modules/catalog/services/courses.service.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassUnitEntity } from '../../src/modules/classes/entities/class-unit.entity.js';
import { ClassContentContextService } from '../../src/modules/classes/services/class-content-context.service.js';
import { MentorContentContextService } from '../../src/modules/classes/services/mentor-content-context.service.js';
import { FileObjectEntity } from '../../src/modules/files/entities/file-object.entity.js';
import type { FileKind } from '../../src/modules/files/files.contracts.js';
import { FileUploadPolicyService } from '../../src/modules/files/services/file-upload-policy.service.js';
import { FilesService } from '../../src/modules/files/services/files.service.js';
import {
  MaterialContentType,
  MaterialEntity,
} from '../../src/modules/materials/entities/material.entity.js';
import { MaterialAuditEventEntity } from '../../src/modules/materials/entities/material-audit-event.entity.js';
import { MaterialFileReferenceEntity } from '../../src/modules/materials/entities/material-file-reference.entity.js';
import { MaterialAuthoringService } from '../../src/modules/materials/services/material-authoring.service.js';
import { MaterialPolicyService } from '../../src/modules/materials/services/material-policy.service.js';
import { UserEntity } from '../../src/modules/users/user.entity.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { UserStatus } from '../../src/modules/users/user-status.enum.js';
import { fileConfig } from '../helpers/files-fixture.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture } from '../helpers/payment-fixture.js';

function unexpectedStorage(): never {
  throw new Error('Unexpected storage operation');
}

describe('Phase 3.3.1 typed Manager materials + PostgreSQL', () => {
  let db: DataSource;
  let fixture: ReturnType<typeof paymentFixture>;
  let service: MaterialAuthoringService;
  let files: FilesService;
  let principal: AuthenticatedUser;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('Dedicated TEST_DATABASE_URL required');
    db = await paymentDatabase('manager_materials', {
      entities: [
        FileObjectEntity,
        MaterialEntity,
        MaterialFileReferenceEntity,
        MaterialAuditEventEntity,
      ],
      migrations: [
        PrivateFileUploads1791504000001,
        StudentMaterialReads1791763200000,
        TypedManagerMaterials1791849600000,
      ],
    });
    await rehearseMigration(db, new TypedManagerMaterials1791849600000(), 'down');
    await rehearseMigration(db, new TypedManagerMaterials1791849600000(), 'up');
    fixture = paymentFixture(db);
    const user = await fixture.user(UserRole.MANAGER);
    principal = { userId: user.id, role: user.role, sessionId: randomUUID() };
    const courses = new CoursesService(db);
    const contexts = new ClassContentContextService(db);
    const uploads = new FileUploadPolicyService(fixture.users, courses, contexts);
    // No storage operation is permitted by metadata authoring/read paths.
    files = new FilesService(db, fileConfig({ MINIO_ENABLED: false }), uploads, {
      assertAvailable: unexpectedStorage,
      presignPut: unexpectedStorage,
      presignGet: unexpectedStorage,
      head: unexpectedStorage,
      copy: unexpectedStorage,
      read: unexpectedStorage,
    });
    service = new MaterialAuthoringService(
      db,
      new MaterialPolicyService(fixture.users, courses, contexts, fixture.enrollments, uploads),
      files,
      courses,
      contexts,
      new MentorContentContextService(db, fixture.workspace, fixture.users, courses, contexts),
    );
  }, 60000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function setup() {
    const order = await fixture.order();
    const unit = await db
      .getRepository(ClassUnitEntity)
      .findOneByOrFail({ classId: order.classIds[0], position: 1 });
    return { unit, order };
  }
  async function ready(unitId: string, kind: FileKind = 'PDF', ownerUserId = principal.userId) {
    const mime =
      kind === 'VIDEO' ? 'video/mp4' : kind === 'IMAGE' ? 'image/png' : 'application/pdf';
    const extension = kind === 'VIDEO' ? '.mp4' : kind === 'IMAGE' ? '.png' : '.pdf';
    return db.getRepository(FileObjectEntity).save({
      ownerUserId,
      courseUnitId: unitId,
      bucket: 'isolated-test',
      stagingKey: `staging/${randomUUID()}`,
      stagingVersionId: randomUUID(),
      objectKey: `final/${randomUUID()}`,
      objectVersionId: randomUUID(),
      originalName: `fixture${extension}`,
      extension,
      declaredMimeType: mime,
      declaredSizeBytes: '10',
      mimeType: mime,
      sizeBytes: '10',
      kind,
      sha256: 'a'.repeat(64),
      status: 'READY',
      intentExpiresAt: new Date(),
      readyAt: new Date(),
    });
  }
  function article(title = 'Lesson') {
    return { contentType: MaterialContentType.ARTICLE, title, contentHtml: '<p>Kiến thức</p>' };
  }

  it('migrates clean up/down/up and preserves the existing FILE read rows during upgrade', async () => {
    const { unit } = await setup();
    const file = await ready(unit.courseUnitId);
    const material = await db.getRepository(MaterialEntity).save({
      courseUnitId: unit.courseUnitId,
      fileObjectId: file.id,
      contentType: MaterialContentType.FILE,
      title: 'legacy',
      createdBy: principal.userId,
    });
    await rehearseMigration(db, new TypedManagerMaterials1791849600000(), 'down');
    await rehearseMigration(db, new TypedManagerMaterials1791849600000(), 'up');
    expect(
      (await db.getRepository(MaterialEntity).findOneByOrFail({ id: material.id })).fileObjectId,
    ).toBe(file.id);
  });

  it('creates/reads canonical ARTICLE-only, summaries omit HTML, metadata works with MinIO disabled', async () => {
    const { unit } = await setup();
    const created = await service.create(principal, unit.courseUnitId, {
      ...article(),
      contentHtml: '<p onclick="bad()">Lesson</p><script>bad()</script>',
    });
    expect(created).toMatchObject({
      contentHtml: '<p>Lesson</p>',
      contentSchemaVersion: 1,
      file: null,
      inlineImages: [],
      attachments: [],
      revision: 1,
      reviewStatus: 'DRAFT',
    });
    expect(await service.detail(principal, created.id)).toEqual(created);
    const listing = await service.list(principal, { page: 1, pageSize: 1 }, unit.courseUnitId);
    expect(listing.total).toBe(1);
    expect(listing.items[0]).not.toHaveProperty('contentHtml');
    expect(JSON.stringify(created)).not.toMatch(
      /bucket|staging|objectKey|ownerUserId|signed|uploadUrl/,
    );
    expect(
      await db
        .getRepository(MaterialAuditEventEntity)
        .countBy({ materialId: created.id, action: 'CREATE' }),
    ).toBe(1);
  });

  it('creates and edits plain text safely, rejects mixed modes and file/text combinations', async () => {
    const { unit } = await setup();
    const created = await service.create(principal, unit.courseUnitId, {
      contentType: MaterialContentType.ARTICLE,
      title: 'Plain lesson',
      contentText: '<script>alert(1)</script>\nA & B',
    });
    expect(created.contentHtml).toContain('&lt;script&gt;');
    expect(created.contentHtml).toContain('A &amp; B');
    const patched = await service.patch(principal, created.id, {
      expectedRevision: created.revision,
      contentText: 'New text',
    });
    expect(patched.contentHtml).toBe('<p>New text</p>');
    await expect(
      service.patch(principal, created.id, {
        expectedRevision: patched.revision,
        contentText: 'text',
        contentHtml: '<p>html</p>',
      }),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_CONTENT_INVALID' } });
    await expect(
      service.create(principal, unit.courseUnitId, {
        contentType: MaterialContentType.FILE,
        title: 'Bad file',
        fileId: randomUUID(),
        contentText: 'text',
      }),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_CONTENT_INVALID' } });
    await expect(
      service.create(principal, unit.courseUnitId, {
        contentType: MaterialContentType.ARTICLE,
        title: 'Empty',
        contentText: '   ',
      }),
    ).rejects.toBeDefined();
  });

  it('supports image-only and one image as both inline and attachment; shared files are allowed', async () => {
    const { unit } = await setup();
    const image = await ready(unit.courseUnitId, 'IMAGE');
    const pdf = await ready(unit.courseUnitId);
    const input = {
      ...article(),
      contentHtml: `<img data-file-id="${image.id}">`,
      attachmentFileIds: [image.id, pdf.id],
    };
    const created = await service.create(principal, unit.courseUnitId, input);
    expect(created.inlineImages).toHaveLength(1);
    expect(created.attachments).toHaveLength(2);
    await service.create(principal, unit.courseUnitId, input);
    expect(await db.getRepository(MaterialFileReferenceEntity).countBy({ fileId: image.id })).toBe(
      4,
    );
  });

  it('Manager can attach a Mentor READY file without inheriting revoked upload scope', async () => {
    const { unit } = await setup();
    const mentor = await fixture.user(UserRole.MENTOR);
    const file = await ready(unit.courseUnitId, 'PDF', mentor.id);
    expect(
      (
        await service.create(principal, unit.courseUnitId, {
          contentType: MaterialContentType.FILE,
          title: 'PDF',
          fileId: file.id,
        })
      ).file?.id,
    ).toBe(file.id);
  });

  it('validates FILE/VIDEO kind, image kind and foreign/missing/failed references atomically', async () => {
    const { unit } = await setup();
    const foreign = await setup();
    const pdf = await ready(unit.courseUnitId);
    const video = await ready(unit.courseUnitId, 'VIDEO');
    const outside = await ready(foreign.unit.courseUnitId);
    for (const input of [
      { contentType: MaterialContentType.VIDEO, title: 'wrong', fileId: pdf.id },
      { contentType: MaterialContentType.FILE, title: 'wrong', fileId: video.id },
      { ...article(), contentHtml: `<img data-file-id="${pdf.id}">` },
      { ...article(), fileId: pdf.id },
      {
        contentType: MaterialContentType.FILE,
        title: 'wrong',
        fileId: pdf.id,
        attachmentFileIds: [pdf.id],
      },
    ]) {
      await expect(service.create(principal, unit.courseUnitId, input)).rejects.toMatchObject({
        status: 422,
      });
    }
    await expect(
      service.create(principal, unit.courseUnitId, {
        ...article(),
        attachmentFileIds: [outside.id],
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service.create(principal, unit.courseUnitId, {
        ...article(),
        attachmentFileIds: [randomUUID()],
      }),
    ).rejects.toMatchObject({ status: 404 });
    await db.getRepository(FileObjectEntity).update(pdf.id, { status: 'FAILED' });
    await expect(
      service.create(principal, unit.courseUnitId, { ...article(), attachmentFileIds: [pdf.id] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await service.create(principal, unit.courseUnitId, {
          contentType: MaterialContentType.VIDEO,
          title: 'Video',
          fileId: video.id,
        })
      ).file?.kind,
    ).toBe('VIDEO');
  });

  it('PATCH preserves omitted refs, clears explicit [], revokes review and preserves first approval', async () => {
    const { unit } = await setup();
    const pdf = await ready(unit.courseUnitId);
    const material = await service.create(principal, unit.courseUnitId, {
      ...article(),
      attachmentFileIds: [pdf.id],
    });
    const first = new Date(Date.now() - 1000);
    await db.getRepository(MaterialEntity).update(material.id, {
      reviewStatus: 'APPROVED' as never,
      approvedRevision: 1,
      reviewedBy: principal.userId,
      reviewedAt: first,
      firstApprovedAt: first,
      publishedAt: first,
    });
    const edited = await service.patch(principal, material.id, {
      expectedRevision: 1,
      title: material.title,
    });
    expect(edited).toMatchObject({
      revision: 2,
      reviewStatus: 'DRAFT',
      approvedRevision: null,
      reviewedBy: null,
      reviewedAt: null,
      publishedAt: null,
      firstApprovedAt: first,
    });
    expect(edited.attachments).toHaveLength(1);
    const cleared = await service.patch(principal, material.id, {
      expectedRevision: 2,
      attachmentFileIds: [],
    });
    expect(cleared.attachments).toHaveLength(0);
    await expect(
      service.patch(principal, material.id, { expectedRevision: 3 }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service.patch(principal, material.id, { expectedRevision: 2, title: 'stale' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('serializes concurrent PATCH and DELETE retries with one audit per actual transition', async () => {
    const { unit } = await setup();
    const material = await service.create(principal, unit.courseUnitId, article());
    const results = await Promise.allSettled([
      service.patch(principal, material.id, { expectedRevision: 1, title: 'one' }),
      service.patch(principal, material.id, { expectedRevision: 1, title: 'two' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    });
    await Promise.all([
      service.delete(principal, material.id, 2),
      service.delete(principal, material.id, 2),
    ]);
    expect(
      await db
        .getRepository(MaterialAuditEventEntity)
        .countBy({ materialId: material.id, action: 'EDIT' }),
    ).toBe(1);
    expect(
      await db
        .getRepository(MaterialAuditEventEntity)
        .countBy({ materialId: material.id, action: 'DELETE' }),
    ).toBe(1);
    await expect(service.detail(principal, material.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.delete(principal, material.id, 1)).rejects.toMatchObject({ status: 409 });
  });

  it('locks union old/new files for reversed swaps and rolls back invalid replacement', async () => {
    const { unit } = await setup();
    const leftFile = await ready(unit.courseUnitId);
    const rightFile = await ready(unit.courseUnitId);
    const left = await service.create(principal, unit.courseUnitId, {
      contentType: MaterialContentType.FILE,
      title: 'left',
      fileId: leftFile.id,
    });
    const right = await service.create(principal, unit.courseUnitId, {
      contentType: MaterialContentType.FILE,
      title: 'right',
      fileId: rightFile.id,
    });
    await Promise.all([
      service.patch(principal, left.id, { expectedRevision: 1, fileId: rightFile.id }),
      service.patch(principal, right.id, { expectedRevision: 1, fileId: leftFile.id }),
    ]);
    const foreign = await setup();
    const bad = await ready(foreign.unit.courseUnitId);
    await expect(
      service.patch(principal, left.id, { expectedRevision: 2, fileId: bad.id }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await service.detail(principal, left.id)).revision).toBe(2);
    expect((await service.detail(principal, left.id)).file?.id).toBe(rightFile.id);
  });

  it('rolls back state and replaced refs if audit insertion fails; audit is append-only', async () => {
    const { unit } = await setup();
    const pdf = await ready(unit.courseUnitId);
    const material = await service.create(principal, unit.courseUnitId, {
      ...article(),
      attachmentFileIds: [pdf.id],
    });
    await db.query(
      "CREATE FUNCTION fail_test_material_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$",
    );
    await db.query(
      'CREATE TRIGGER fail_test_material_audit BEFORE INSERT ON material_audit_events FOR EACH ROW EXECUTE FUNCTION fail_test_material_audit()',
    );
    try {
      await expect(
        service.patch(principal, material.id, {
          expectedRevision: 1,
          attachmentFileIds: [],
          title: 'changed',
        }),
      ).rejects.toThrow('test failure');
    } finally {
      await db.query('DROP TRIGGER fail_test_material_audit ON material_audit_events');
      await db.query('DROP FUNCTION fail_test_material_audit()');
    }
    const current = await service.detail(principal, material.id);
    expect(current.revision).toBe(1);
    expect(current.attachments).toHaveLength(1);
    await expect(
      db.getRepository(MaterialAuditEventEntity).delete({ materialId: material.id }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces DB typed constraints, immutable type/approval, reference scope and file state protection', async () => {
    const { unit } = await setup();
    const image = await ready(unit.courseUnitId, 'IMAGE');
    const material = await service.create(principal, unit.courseUnitId, {
      ...article(),
      attachmentFileIds: [image.id],
    });
    await expect(
      db.getRepository(MaterialEntity).update(material.id, { fileObjectId: image.id }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.getRepository(MaterialEntity).update(material.id, {
        contentType: MaterialContentType.FILE,
        fileObjectId: image.id,
        contentHtml: null,
        contentSchemaVersion: null,
      }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.getRepository(FileObjectEntity).update(image.id, { status: 'FAILED' }),
    ).rejects.toMatchObject({ code: '23514' });
    await service.delete(principal, material.id, 1);
    await expect(
      db.getRepository(FileObjectEntity).update(image.id, { deletedAt: new Date() }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects wrong session ancestry and parent reparenting at the database boundary', async () => {
    const { unit } = await setup();
    const other = await setup();
    const session = await db
      .getRepository(ClassSessionEntity)
      .findOneByOrFail({ classUnitId: other.unit.id });
    await expect(
      service.create(principal, unit.courseUnitId, { ...article(), sessionId: session.id }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      db.getRepository(ClassSessionEntity).update(session.id, { classUnitId: unit.id }),
    ).rejects.toMatchObject({ code: '23514' });
    const valid = await service.create(principal, other.unit.courseUnitId, {
      ...article(),
      sessionId: session.id,
    });
    expect(valid.sessionId).toBe(session.id);
  });

  it('serializes attach/file state mutation so a referenced FAILED file cannot commit', async () => {
    const { unit } = await setup();
    const file = await ready(unit.courseUnitId);
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await files.assertReadyReferences(principal, [file.id], unit.courseUnitId, runner.manager);
      const change = db.getRepository(FileObjectEntity).update(file.id, { status: 'FAILED' });
      const material = await runner.manager.getRepository(MaterialEntity).save({
        courseUnitId: unit.courseUnitId,
        fileObjectId: file.id,
        contentType: MaterialContentType.FILE,
        title: 'locked',
        createdBy: principal.userId,
      });
      await runner.commitTransaction();
      await expect(change).rejects.toMatchObject({ code: '23514' });
      expect((await service.detail(principal, material.id)).file?.id).toBe(file.id);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('rejects suspended/role-changed Manager and protects role/status while actor share lock is held', async () => {
    const { unit } = await setup();
    const user = await fixture.user(UserRole.MANAGER);
    const actor = { ...principal, userId: user.id };
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await fixture.users.findActiveByRole(actor.userId, actor.role, runner.manager, true);
      let changed = false;
      const revoke = db
        .getRepository(UserEntity)
        .update(user.id, { status: UserStatus.SUSPENDED })
        .then(() => {
          changed = true;
        });
      await runner.manager.query('SELECT pg_sleep(0.05)');
      expect(changed).toBe(false);
      await runner.commitTransaction();
      await revoke;
      await expect(service.create(actor, unit.courseUnitId, article())).rejects.toMatchObject({
        status: 403,
      });
      await db
        .getRepository(UserEntity)
        .update(user.id, { status: UserStatus.ACTIVE, role: UserRole.MENTOR });
      await expect(service.list(actor, { page: 1, pageSize: 20 })).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('refuses a lossy down migration after typed/audit data and preserves the schema', async () => {
    await expect(
      rehearseMigration(db, new TypedManagerMaterials1791849600000(), 'down'),
    ).rejects.toThrow('Typed data exists; roll back app only');
    expect(await db.getRepository(MaterialAuditEventEntity).count()).toBeGreaterThan(0);
    expect(await db.showMigrations()).toBe(false);
  });
});
