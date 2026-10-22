import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrivateFileUploads1791504000001 } from '../../src/database/migrations/1791504000001-private-file-uploads.js';
import { StudentMaterialReads1791763200000 } from '../../src/database/migrations/1791763200000-student-material-reads.js';
import { TypedManagerMaterials1791849600000 } from '../../src/database/migrations/1791849600000-typed-manager-materials.js';
import { ClassUnitReleaseAudit1791856800000 } from '../../src/database/migrations/1791856800000-class-unit-release-audit.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { CoursesService } from '../../src/modules/catalog/services/courses.service.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassUnitEntity } from '../../src/modules/classes/entities/class-unit.entity.js';
import { ClassUnitReleaseAuditEntity } from '../../src/modules/classes/entities/class-unit-release-audit.entity.js';
import { ClassContentContextService } from '../../src/modules/classes/services/class-content-context.service.js';
import { MentorContentContextService } from '../../src/modules/classes/services/mentor-content-context.service.js';
import { UnitContentService } from '../../src/modules/classes/services/unit-content.service.js';
import { EnrollmentEntity } from '../../src/modules/enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../src/modules/enrollments/enums/enrollment-status.enum.js';
import { FileMetadataEntity } from '../../src/modules/files/entities/file-metadata.entity.js';
import { FileObjectEntity } from '../../src/modules/files/entities/file-object.entity.js';
import { FileProcessingJobEntity } from '../../src/modules/files/entities/file-processing-job.entity.js';
import { FileProcessingService } from '../../src/modules/files/services/file-processing.service.js';
import { FileUploadPolicyService } from '../../src/modules/files/services/file-upload-policy.service.js';
import { FilesService } from '../../src/modules/files/services/files.service.js';
import { validateBinary } from '../../src/modules/files/validation/binary-validation.js';
import { MaterialReviewStatus } from '../../src/modules/materials/domain/material-contract.js';
import { StudentMaterialDetailDto } from '../../src/modules/materials/dtos/student-material.dto.js';
import {
  MaterialContentType,
  MaterialEntity,
} from '../../src/modules/materials/entities/material.entity.js';
import { MaterialAuditEventEntity } from '../../src/modules/materials/entities/material-audit-event.entity.js';
import { MaterialFileReferenceEntity } from '../../src/modules/materials/entities/material-file-reference.entity.js';
import { MaterialAuthoringService } from '../../src/modules/materials/services/material-authoring.service.js';
import { MaterialPolicyService } from '../../src/modules/materials/services/material-policy.service.js';
import { StudentMaterialsService } from '../../src/modules/materials/services/student-materials.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { fileConfig, storageFixture, upload } from '../helpers/files-fixture.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture } from '../helpers/payment-fixture.js';

describe('Material authoring, review and student delivery with PostgreSQL + MinIO', () => {
  let db: DataSource;
  let fixture: ReturnType<typeof paymentFixture>;
  let remote: Awaited<ReturnType<typeof storageFixture>>;
  let author: MaterialAuthoringService;
  let reads: StudentMaterialsService;
  let units: UnitContentService;
  let files: FilesService;
  let worker: FileProcessingService;
  let manager: AuthenticatedUser;
  const principal = (user: { id: string; role: UserRole }): AuthenticatedUser => ({
    userId: user.id,
    role: user.role,
    sessionId: randomUUID(),
  });
  const article = {
    contentType: MaterialContentType.ARTICLE,
    title: 'Bài học',
    contentHtml: '<h2>Xin chào</h2><p>Kiến thức <strong>cơ bản</strong>.</p>',
  };
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error('Requires dedicated TEST_DATABASE_URL and local MinIO');
    db = await paymentDatabase('material_authoring', {
      entities: [
        FileObjectEntity,
        FileMetadataEntity,
        FileProcessingJobEntity,
        MaterialEntity,
        MaterialFileReferenceEntity,
        MaterialAuditEventEntity,
        ClassUnitReleaseAuditEntity,
      ],
      migrations: [
        PrivateFileUploads1791504000001,
        StudentMaterialReads1791763200000,
        TypedManagerMaterials1791849600000,
        ClassUnitReleaseAudit1791856800000,
      ],
    });
    // Round-trip both additive migrations before any authoring data exists.
    await rehearseMigration(db, new ClassUnitReleaseAudit1791856800000(), 'down');
    await rehearseMigration(db, new ClassUnitReleaseAudit1791856800000(), 'up');
    await rehearseMigration(db, new TypedManagerMaterials1791849600000(), 'down');
    await rehearseMigration(db, new TypedManagerMaterials1791849600000(), 'up');
    fixture = paymentFixture(db);
    const config = fileConfig();
    remote = await storageFixture(config);
    const contexts = new ClassContentContextService(db);
    const courses = new CoursesService(db);
    const policy = new FileUploadPolicyService(fixture.users, courses, contexts);
    files = new FilesService(db, config, policy, remote.storage);
    worker = new FileProcessingService(db, config, remote.storage, { validate: validateBinary });
    const materials = new MaterialPolicyService(
      fixture.users,
      courses,
      contexts,
      fixture.enrollments,
      policy,
    );
    author = new MaterialAuthoringService(
      db,
      materials,
      files,
      courses,
      contexts,
      new MentorContentContextService(db, fixture.workspace, fixture.users, courses, contexts),
    );
    reads = new StudentMaterialsService(db, contexts, materials, files);
    units = new UnitContentService(db, fixture.workspace, contexts, fixture.users, courses);
    manager = principal(await fixture.user(UserRole.MANAGER));
  }, 60000);
  afterAll(async () => {
    if (remote) await remote.cleanup();
    if (db?.isInitialized) await db.destroy();
  }, 30000);
  async function setup() {
    const order = await fixture.order();
    const classId = order.classIds[0];
    if (!classId) throw new Error('Missing class');
    const unit = await db.getRepository(ClassUnitEntity).findOneByOrFail({ classId, position: 1 });
    return {
      order,
      classId,
      unit,
      mentor: principal(order.mentor),
      student: principal(order.student),
    };
  }
  async function ready(s: Awaited<ReturnType<typeof setup>>, kind: 'text' | 'image' = 'text') {
    const bytes =
      kind === 'image'
        ? Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8WQAAAAASUVORK5CYII=',
            'base64',
          )
        : Buffer.from('Course material bytes');
    const mime = kind === 'image' ? 'image/png' : 'text/plain';
    const intent = await files.createIntent(s.mentor, {
      courseUnitId: s.unit.courseUnitId,
      classId: s.classId,
      classUnitId: s.unit.id,
      originalFilename: kind === 'image' ? 'diagram.png' : 'lesson.txt',
      declaredMimeType: mime,
      declaredSizeBytes: bytes.length,
    });
    await upload(intent.uploadUrl, mime, bytes);
    await files.complete(s.mentor, intent.fileId);
    const claim = await worker.claim();
    if (!claim) throw new Error('Missing file job');
    await worker.process(claim);
    expect((await files.detail(s.mentor, intent.fileId)).status).toBe('READY');
    return intent.fileId;
  }
  it('mentor article → submit → manager approve → paid student reads canonical HTML and downloads attachment', async () => {
    const s = await setup();
    const fileId = await ready(s);
    const draft = await author.create(
      s.mentor,
      s.unit.id,
      {
        ...article,
        contentHtml: `${article.contentHtml}<script>bad()</script>`,
        attachmentFileIds: [fileId],
      },
      { classId: s.classId, classUnitId: s.unit.id },
    );
    expect(draft).toMatchObject({
      reviewStatus: 'DRAFT',
      revision: 1,
      file: null,
      canEdit: true,
      createdInClassId: s.classId,
    });
    expect(draft.contentHtml).not.toContain('script');
    await expect(reads.detail(s.student, s.classId, draft.id)).rejects.toMatchObject({
      response: { code: 'MATERIAL_ACCESS_DENIED' },
    });
    await author.submit(s.mentor, draft.id, 1, { classId: s.classId });
    await expect(
      author.patch(
        s.mentor,
        draft.id,
        { expectedRevision: 1, title: 'Hidden edit' },
        { classId: s.classId },
      ),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_ACCESS_DENIED' } });
    const queue = await author.list(manager, {
      page: 1,
      pageSize: 20,
      reviewStatus: MaterialReviewStatus.PENDING_REVIEW,
    });
    expect(queue.items.map((item) => item.id)).toContain(draft.id);
    expect(queue.items[0]).not.toHaveProperty('contentHtml');
    const preview = await author.accessAtRevision(manager, draft.id, 1, fileId);
    expect((await fetch(preview.url)).status).toBe(200);
    await author.review(manager, draft.id, { action: 'APPROVE', expectedRevision: 1 });
    await db
      .getRepository(EnrollmentEntity)
      .update(
        { studentId: s.student.userId, classId: s.classId },
        { status: EnrollmentStatus.ACTIVE },
      );
    expect(
      (await reads.list(s.student, s.classId, s.unit.id, { page: 1, pageSize: 20 })).total,
    ).toBe(1);
    const read = new StudentMaterialDetailDto(await reads.detail(s.student, s.classId, draft.id));
    expect(read.contentHtml).toBe(draft.contentHtml);
    expect(read.attachments[0]?.id).toBe(fileId);
    const signed = await reads.accessAtRevision(s.student, s.classId, draft.id, fileId, 1);
    expect(Buffer.from(await (await fetch(signed.url)).arrayBuffer()).toString()).toBe(
      'Course material bytes',
    );
    await expect(
      reads.accessAtRevision(s.student, s.classId, draft.id, randomUUID(), 1),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_NOT_FOUND' } });
    await expect(reads.download(s.student, s.classId, draft.id)).rejects.toMatchObject({
      response: { code: 'MATERIAL_NOT_FOUND' },
    });
  });
  it('persists FILE creation and manager approval, then primary signed download', async () => {
    const s = await setup();
    const fileId = await ready(s);
    const file = await author.create(manager, s.unit.courseUnitId, {
      contentType: MaterialContentType.FILE,
      title: 'File',
      fileId,
    });
    await author.review(manager, file.id, { action: 'APPROVE', expectedRevision: 1 });
    await db
      .getRepository(EnrollmentEntity)
      .update(
        { studentId: s.student.userId, classId: s.classId },
        { status: EnrollmentStatus.ACTIVE },
      );
    expect((await fetch((await reads.download(s.student, s.classId, file.id)).url)).status).toBe(
      200,
    );
    await expect(
      author.create(manager, s.unit.courseUnitId, {
        contentType: MaterialContentType.VIDEO,
        title: 'Wrong kind',
        fileId,
      }),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_CONTENT_INVALID' } });
  });
  it('review retries are idempotent; edits revoke approval; stale review and mentor reclaim fail', async () => {
    const s = await setup();
    const draft = await author.create(s.mentor, s.unit.id, article, {
      classId: s.classId,
      classUnitId: s.unit.id,
    });
    await expect(
      author.review(manager, draft.id, { action: 'APPROVE', expectedRevision: 1 }),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_REVIEW_CONFLICT' } });
    await author.submit(s.mentor, draft.id, 1, { classId: s.classId });
    await author.review(manager, draft.id, {
      action: 'REJECT',
      expectedRevision: 1,
      reason: 'Bổ sung ví dụ',
    });
    await expect(
      author.submit(s.mentor, draft.id, 1, { classId: s.classId }),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_REVIEW_CONFLICT' } });
    await author.patch(
      s.mentor,
      draft.id,
      { expectedRevision: 1, contentHtml: '<p>Đã thêm ví dụ</p>' },
      { classId: s.classId },
    );
    await author.submit(s.mentor, draft.id, 2, { classId: s.classId });
    const results = await Promise.all([
      author.review(manager, draft.id, { action: 'APPROVE', expectedRevision: 2 }),
      author.review(manager, draft.id, { action: 'APPROVE', expectedRevision: 2 }),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      await db
        .getRepository(MaterialAuditEventEntity)
        .countBy({ materialId: draft.id, action: 'APPROVE' }),
    ).toBe(1);
    await author.review(manager, draft.id, { action: 'UNPUBLISH', expectedRevision: 2 });
    await author.review(manager, draft.id, { action: 'APPROVE', expectedRevision: 2 });
    expect((await author.detail(manager, draft.id)).publishedAt).toBeNull();
    const edited = await author.patch(manager, draft.id, { expectedRevision: 2, title: 'Updated' });
    expect(edited).toMatchObject({
      revision: 3,
      reviewStatus: 'DRAFT',
      publishedAt: null,
      approvedRevision: null,
    });
    expect(edited.firstApprovedAt).not.toBeNull();
    await expect(
      author.review(manager, draft.id, { action: 'APPROVE', expectedRevision: 2 }),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_REVIEW_CONFLICT' } });
    await expect(
      author.patch(
        s.mentor,
        draft.id,
        { expectedRevision: 3, title: 'Reclaim' },
        { classId: s.classId },
      ),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_ACCESS_DENIED' } });
    await author.review(manager, draft.id, { action: 'APPROVE', expectedRevision: 3 });
  });
  it('locks review decisions against one another and rolls back rejected edits', async () => {
    const s = await setup();
    const draft = await author.create(s.mentor, s.unit.id, article, {
      classId: s.classId,
      classUnitId: s.unit.id,
    });
    await author.submit(s.mentor, draft.id, 1, { classId: s.classId });
    const results = await Promise.allSettled([
      author.review(manager, draft.id, { action: 'APPROVE', expectedRevision: 1 }),
      author.review(manager, draft.id, {
        action: 'REJECT',
        expectedRevision: 1,
        reason: 'Changes required',
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const before = await author.detail(manager, draft.id);
    await expect(
      author.patch(manager, draft.id, { expectedRevision: 1, contentHtml: '<script>bad</script>' }),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_CONTENT_INVALID' } });
    expect(await author.detail(manager, draft.id)).toEqual(before);
  });
  it('hides foreign drafts, filters before pagination, and rechecks assignment for text-only mutations', async () => {
    const s = await setup();
    const other = await setup();
    const draft = await author.create(s.mentor, s.unit.id, article, {
      classId: s.classId,
      classUnitId: s.unit.id,
    });
    await expect(
      author.detail(other.mentor, draft.id, { classId: s.classId }),
    ).rejects.toMatchObject({
      response: { code: 'MATERIAL_ACCESS_DENIED' },
    });
    await db.getRepository(ClassEntity).update(s.classId, { mentorId: other.mentor.userId });
    expect(
      (
        await author.list(other.mentor, { page: 1, pageSize: 20 }, undefined, {
          classId: s.classId,
          classUnitId: s.unit.id,
        })
      ).total,
    ).toBe(0);
    await expect(
      author.submit(s.mentor, draft.id, 1, { classId: s.classId }),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_ACCESS_DENIED' } });
    await expect(
      author.create(s.mentor, s.unit.id, article, { classId: s.classId, classUnitId: s.unit.id }),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_ACCESS_DENIED' } });
  });
  it('validates references, file ownership, article typing and soft deletion without deleting bytes', async () => {
    const s = await setup();
    const other = await setup();
    const fileId = await ready(other);
    await expect(
      author.create(
        s.mentor,
        s.unit.id,
        {
          ...article,
          attachmentFileIds: [fileId],
        },
        { classId: s.classId, classUnitId: s.unit.id },
      ),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_ACCESS_DENIED' } });
    await expect(
      author.create(manager, s.unit.courseUnitId, { ...article, fileId }),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_CONTENT_INVALID' } });
    await expect(
      author.create(manager, s.unit.courseUnitId, {
        ...article,
        contentHtml: `<img data-file-id="${fileId}">`,
      }),
    ).rejects.toMatchObject({ response: { code: 'MATERIAL_SCOPE_MISMATCH' } });
    const draft = await author.create(s.mentor, s.unit.id, article, {
      classId: s.classId,
      classUnitId: s.unit.id,
    });
    await author.delete(s.mentor, draft.id, 1, { classId: s.classId });
    await author.delete(s.mentor, draft.id, 1, { classId: s.classId });
    await expect(author.detail(manager, draft.id)).rejects.toMatchObject({
      response: { code: 'MATERIAL_NOT_FOUND' },
    });
    expect(
      await db
        .getRepository(MaterialAuditEventEntity)
        .countBy({ materialId: draft.id, action: 'DELETE' }),
    ).toBe(1);
    expect((await files.detail(other.mentor, fileId)).status).toBe('READY');
  });
  it('unit metadata updates check course ancestry and preserve the HTML article separately', async () => {
    const s = await setup();
    const other = await setup();
    const course = await db.getRepository(ClassEntity).findOneByOrFail({ id: s.classId });
    const courses = new CoursesService(db);
    await expect(
      courses.updateUnit(course.courseId, other.unit.courseUnitId, { title: 'Bad parent' }),
    ).rejects.toMatchObject({ response: { code: 'COURSE_UNIT_NOT_FOUND' } });
    const updated = await courses.updateUnit(course.courseId, s.unit.courseUnitId, {
      title: 'Updated unit',
      description: 'Overview',
    });
    expect(updated).toMatchObject({ title: 'Updated unit', description: 'Overview' });
    expect(
      (await units.list(s.mentor, s.classId, { page: 1, pageSize: 20 })).items[0],
    ).toMatchObject({ title: 'Updated unit', courseUnitId: s.unit.courseUnitId });
  });
});
