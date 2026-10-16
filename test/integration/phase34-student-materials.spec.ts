import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrivateFileUploads1791504000001 } from '../../src/database/migrations/1791504000001-private-file-uploads.js';
import { StudentMaterialReads1791763200000 } from '../../src/database/migrations/1791763200000-student-material-reads.js';
import { TypedManagerMaterials1791849600000 } from '../../src/database/migrations/1791849600000-typed-manager-materials.js';
import { ClassUnitReleaseAudit1791856800000 } from '../../src/database/migrations/1791856800000-class-unit-release-audit.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { CoursesService } from '../../src/modules/catalog/services/courses.service.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassUnitEntity } from '../../src/modules/classes/entities/class-unit.entity.js';
import { ClassUnitReleaseAuditEntity } from '../../src/modules/classes/entities/class-unit-release-audit.entity.js';
import { ClassStatus } from '../../src/modules/classes/enums/class-status.enum.js';
import { ClassUnitStatus } from '../../src/modules/classes/enums/class-unit-status.enum.js';
import { ClassContentContextService } from '../../src/modules/classes/services/class-content-context.service.js';
import { ClassUnitReleaseService } from '../../src/modules/classes/services/class-unit-release.service.js';
import { EnrollmentEntity } from '../../src/modules/enrollments/entities/enrollment.entity.js';
import { EnrollmentStatus } from '../../src/modules/enrollments/enums/enrollment-status.enum.js';
import { FileMetadataEntity } from '../../src/modules/files/entities/file-metadata.entity.js';
import { FileObjectEntity } from '../../src/modules/files/entities/file-object.entity.js';
import { FileProcessingJobEntity } from '../../src/modules/files/entities/file-processing-job.entity.js';
import { FileProcessingService } from '../../src/modules/files/services/file-processing.service.js';
import { FileUploadPolicyService } from '../../src/modules/files/services/file-upload-policy.service.js';
import { FilesService } from '../../src/modules/files/services/files.service.js';
import { validateBinary } from '../../src/modules/files/validation/binary-validation.js';
import { sanitizeArticle } from '../../src/modules/materials/domain/article-sanitizer.js';
import { MaterialReviewStatus } from '../../src/modules/materials/domain/material-contract.js';
import {
  StudentMaterialDetailDto,
  StudentMaterialDto,
} from '../../src/modules/materials/dtos/student-material.dto.js';
import {
  MaterialContentType,
  MaterialEntity,
} from '../../src/modules/materials/entities/material.entity.js';
import {
  MaterialFileReferenceEntity,
  MaterialReferenceRole,
} from '../../src/modules/materials/entities/material-file-reference.entity.js';
import { MaterialPolicyService } from '../../src/modules/materials/services/material-policy.service.js';
import { StudentMaterialsService } from '../../src/modules/materials/services/student-materials.service.js';
import { UserEntity } from '../../src/modules/users/user.entity.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { UserStatus } from '../../src/modules/users/user-status.enum.js';
import { binaryFixtures, fileConfig, storageFixture, upload } from '../helpers/files-fixture.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture } from '../helpers/payment-fixture.js';

describe('Student materials: PostgreSQL + signed private MinIO GET', () => {
  let db: DataSource;
  let config: ConfigService;
  let remote: Awaited<ReturnType<typeof storageFixture>>;
  let fixture: ReturnType<typeof paymentFixture>;
  let files: FilesService;
  let reads: StudentMaterialsService;
  let manager: AuthenticatedUser;
  const bytes = Buffer.from('Verified course document contents');
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error('Student material tests require dedicated TEST_DATABASE_URL + local MinIO');
    db = await paymentDatabase('student_materials', {
      entities: [
        FileObjectEntity,
        FileMetadataEntity,
        FileProcessingJobEntity,
        MaterialEntity,
        MaterialFileReferenceEntity,
        ClassUnitReleaseAuditEntity,
      ],
      migrations: [
        PrivateFileUploads1791504000001,
        StudentMaterialReads1791763200000,
        TypedManagerMaterials1791849600000,
        ClassUnitReleaseAudit1791856800000,
      ],
    });
    // Migration up/down/up is safe only on this isolated empty test database.
    await rehearseMigration(db, new ClassUnitReleaseAudit1791856800000(), 'down');
    await rehearseMigration(db, new ClassUnitReleaseAudit1791856800000(), 'up');
    fixture = paymentFixture(db);
    config = fileConfig({ FILE_GET_TTL_SECONDS: 2 });
    remote = await storageFixture(config);
    const contexts = new ClassContentContextService(db);
    const courses = new CoursesService(db);
    const uploads = new FileUploadPolicyService(fixture.users, courses, contexts);
    files = new FilesService(db, config, uploads, remote.storage);
    reads = new StudentMaterialsService(
      db,
      contexts,
      new MaterialPolicyService(fixture.users, courses, contexts, fixture.enrollments, uploads),
      files,
    );
    const user = await fixture.user(UserRole.MANAGER);
    manager = { userId: user.id, role: user.role, sessionId: randomUUID() };
  }, 60000);
  afterAll(async () => {
    if (remote) await remote.cleanup();
    if (db?.isInitialized) await db.destroy();
  }, 30000);

  async function setup(count = 1) {
    const order = await fixture.order({ count });
    const classId = order.classIds[0];
    if (!classId) throw new Error('Missing class');
    const unit = await db.getRepository(ClassUnitEntity).findOneByOrFail({ classId, position: 1 });
    const intent = await files.createIntent(manager, {
      courseUnitId: unit.courseUnitId,
      originalFilename: 'Bài học.txt',
      declaredMimeType: 'text/plain',
      declaredSizeBytes: bytes.length,
    });
    await upload(intent.uploadUrl, 'text/plain', bytes);
    await files.complete(manager, intent.fileId);
    const worker = new FileProcessingService(db, config, remote.storage, {
      validate: validateBinary,
    });
    const claim = await worker.claim();
    if (!claim) throw new Error('Missing validation claim');
    await worker.process(claim);
    expect((await files.detail(manager, intent.fileId)).status).toBe('READY');
    const approvedAt = new Date(Date.now() - 1000);
    const material = await db.getRepository(MaterialEntity).save(
      db.getRepository(MaterialEntity).create({
        courseUnitId: unit.courseUnitId,
        fileObjectId: intent.fileId,
        contentType: MaterialContentType.FILE,
        title: 'Visible lesson',
        description: null,
        sortOrder: 0,
        availableAt: null,
        sessionId: null,
        createdBy: manager.userId,
        createdInClassId: null,
        revision: 1,
        reviewStatus: MaterialReviewStatus.APPROVED,
        approvedRevision: 1,
        reviewedBy: manager.userId,
        reviewedAt: approvedAt,
        firstApprovedAt: approvedAt,
        rejectionReason: null,
        publishedAt: approvedAt,
        deletedAt: null,
      }),
    );
    const principal: AuthenticatedUser = {
      userId: order.student.id,
      role: UserRole.STUDENT,
      sessionId: randomUUID(),
    };
    const activate = async () => {
      for (const id of order.classIds)
        await db
          .getRepository(EnrollmentEntity)
          .update(
            { studentId: principal.userId, classId: id },
            { status: EnrollmentStatus.ACTIVE, enrolledAt: new Date() },
          );
      await db.getRepository(ClassUnitEntity).update(unit.id, { status: ClassUnitStatus.OPEN });
    };
    return {
      order,
      classId,
      unit,
      material: { ...material, fileObjectId: intent.fileId },
      principal,
      activate,
    };
  }

  it('release commands independently gate shared Student content without altering material/enrollment/progress', async () => {
    const s = await setup(2);
    const actor = { userId: s.order.mentor.id, role: UserRole.MENTOR, sessionId: randomUUID() };
    const release = new ClassUnitReleaseService(db, fixture.users, new CoursesService(db));
    const secondClass = s.order.classIds[1];
    if (!secondClass) throw new Error('Missing second class');
    const second = await db
      .getRepository(ClassUnitEntity)
      .findOneByOrFail({ classId: secondClass, position: 1 });
    const beforePending = await db.query(
      'SELECT * FROM enrollments WHERE student_id=$1 ORDER BY id',
      [s.principal.userId],
    );
    await release.update(actor, s.classId, s.unit.id, { status: ClassUnitStatus.OPEN });
    await expect(reads.detail(s.principal, s.classId, s.material.id)).rejects.toMatchObject({
      status: 403,
    });
    expect(
      await db.query('SELECT * FROM enrollments WHERE student_id=$1 ORDER BY id', [
        s.principal.userId,
      ]),
    ).toEqual(beforePending);
    await s.activate();
    const materialBefore = await db
      .getRepository(MaterialEntity)
      .findOneByOrFail({ id: s.material.id });
    const enrollmentsBefore = await db.query(
      'SELECT * FROM enrollments WHERE student_id=$1 ORDER BY id',
      [s.principal.userId],
    );
    const progressBefore = await db.query('SELECT * FROM class_unit_progress ORDER BY id');
    await release.update(actor, secondClass, second.id, {
      status: ClassUnitStatus.OPEN,
      unlockAt: new Date(Date.now() + 60000).toISOString(),
    });
    expect((await reads.detail(s.principal, s.classId, s.material.id)).material.id).toBe(
      s.material.id,
    );
    await expect(reads.detail(s.principal, secondClass, s.material.id)).rejects.toMatchObject({
      status: 404,
    });
    await release.update(actor, secondClass, second.id, {
      status: ClassUnitStatus.OPEN,
      unlockAt: new Date(Date.now() - 1).toISOString(),
    });
    expect((await reads.detail(s.principal, secondClass, s.material.id)).material.id).toBe(
      s.material.id,
    );
    await release.update(actor, s.classId, s.unit.id, {
      status: ClassUnitStatus.LOCKED,
      unlockAt: new Date(Date.now() - 1).toISOString(),
    });
    await expect(reads.download(s.principal, s.classId, s.material.id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await reads.detail(s.principal, secondClass, s.material.id)).material.id).toBe(
      s.material.id,
    );
    expect(await db.getRepository(MaterialEntity).findOneByOrFail({ id: s.material.id })).toEqual(
      materialBefore,
    );
    expect(
      await db.query('SELECT * FROM enrollments WHERE student_id=$1 ORDER BY id', [
        s.principal.userId,
      ]),
    ).toEqual(enrollmentsBefore);
    expect(await db.query('SELECT * FROM class_unit_progress ORDER BY id')).toEqual(progressBefore);
  });

  it('filters hidden rows before count/page and maps only student-safe fields', async () => {
    const s = await setup();
    await s.activate();
    await db.getRepository(MaterialEntity).insert({
      ...s.material,
      id: randomUUID(),
      title: 'Draft secret',
      sortOrder: 0,
      reviewStatus: MaterialReviewStatus.DRAFT,
      approvedRevision: null,
      reviewedBy: null,
      reviewedAt: null,
      firstApprovedAt: null,
      publishedAt: null,
    });
    await db.getRepository(MaterialEntity).insert({
      ...s.material,
      id: randomUUID(),
      title: 'Future secret',
      availableAt: new Date(Date.now() + 60000),
    });
    await db
      .getRepository(MaterialEntity)
      .insert({ ...s.material, id: randomUUID(), title: 'Second visible', sortOrder: 1 });
    const page = await reads.list(s.principal, s.classId, s.unit.id, { page: 1, pageSize: 1 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.material.id).toBe(s.material.id);
    const second = await reads.list(s.principal, s.classId, s.unit.id, { page: 2, pageSize: 1 });
    expect(second.items[0]?.material.title).toBe('Second visible');
    expect(
      (await reads.list(s.principal, s.classId, s.unit.id, { page: 3, pageSize: 1 })).items,
    ).toEqual([]);
    const detail = new StudentMaterialDto(
      await reads.detail(s.principal, s.classId, s.material.id),
    );
    expect(detail.file).toMatchObject({ originalFilename: 'Bài học.txt', sizeBytes: bytes.length });
    for (const field of [
      'bucket',
      'stagingKey',
      'objectKey',
      'objectVersionId',
      'ownerUserId',
      'reviewedBy',
      'rejectionReason',
      'url',
    ])
      expect(JSON.stringify(detail)).not.toContain(`"${field}"`);
  });

  it('denies pending/outsiders and wrong parent IDs, and returns empty for locked/future units', async () => {
    const s = await setup();
    await expect(
      reads.list(s.principal, s.classId, s.unit.id, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(reads.download(s.principal, s.classId, s.material.id)).rejects.toMatchObject({
      status: 403,
    });
    await s.activate();
    const outsider = await fixture.user();
    await expect(
      reads.detail({ ...s.principal, userId: outsider.id }, s.classId, s.material.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      reads.list(s.principal, s.classId, randomUUID(), { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ status: 404 });
    const foreign = await setup();
    await expect(
      reads.list(s.principal, s.classId, foreign.unit.id, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(reads.detail(s.principal, s.classId, foreign.material.id)).rejects.toMatchObject({
      status: 404,
    });
    for (const update of [
      { status: ClassUnitStatus.LOCKED },
      { status: ClassUnitStatus.OPEN, unlockAt: new Date(Date.now() + 60000) },
    ]) {
      await db.getRepository(ClassUnitEntity).update(s.unit.id, update);
      expect(
        (await reads.list(s.principal, s.classId, s.unit.id, { page: 1, pageSize: 20 })).total,
      ).toBe(0);
      await expect(reads.detail(s.principal, s.classId, s.material.id)).rejects.toMatchObject({
        status: 404,
      });
    }
    await db
      .getRepository(ClassUnitEntity)
      .update(s.unit.id, { unlockAt: new Date(Date.now() - 1) });
    expect((await reads.detail(s.principal, s.classId, s.material.id)).material.id).toBe(
      s.material.id,
    );
  });

  it('shares material across classes but independently checks each delivery gate', async () => {
    const s = await setup(2);
    await s.activate();
    const otherClass = s.order.classIds[1];
    if (!otherClass) throw new Error('Missing second class');
    const otherUnit = await db
      .getRepository(ClassUnitEntity)
      .findOneByOrFail({ classId: otherClass, position: 1 });
    await expect(reads.detail(s.principal, otherClass, s.material.id)).rejects.toMatchObject({
      status: 404,
    });
    await db
      .getRepository(ClassUnitEntity)
      .update(otherUnit.id, { status: ClassUnitStatus.COMPLETED });
    const view = await reads.detail(s.principal, otherClass, s.material.id);
    expect(view.classUnitId).toBe(otherUnit.id);
    await db.getRepository(ClassEntity).update(otherClass, { status: ClassStatus.COMPLETED });
    expect((await reads.detail(s.principal, otherClass, s.material.id)).material.id).toBe(
      s.material.id,
    );
    await db
      .getRepository(EnrollmentEntity)
      .update(
        { classId: otherClass, studentId: s.principal.userId },
        { status: EnrollmentStatus.COMPLETED },
      );
    await expect(reads.detail(s.principal, otherClass, s.material.id)).rejects.toMatchObject({
      status: 403,
    });
    await db.getRepository(ClassEntity).update(s.classId, { status: ClassStatus.CANCELLED });
    await expect(
      reads.list(s.principal, s.classId, s.unit.id, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    'unpublished',
    'deleted',
    'edited',
    'future',
    'file-failed',
    'file-deleted',
    'wrong-file-scope',
    'wrong-kind',
  ])('hides %s metadata and assets on subsequent requests', async (gate) => {
    const s = await setup();
    await s.activate();
    if (gate === 'unpublished')
      await db.getRepository(MaterialEntity).update(s.material.id, { publishedAt: null });
    if (gate === 'deleted')
      await db
        .getRepository(MaterialEntity)
        .update(s.material.id, { deletedAt: new Date(), publishedAt: null });
    if (gate === 'edited')
      await db.getRepository(MaterialEntity).update(s.material.id, {
        revision: 2,
        reviewStatus: MaterialReviewStatus.DRAFT,
        approvedRevision: null,
        publishedAt: null,
      });
    if (gate === 'future')
      await db
        .getRepository(MaterialEntity)
        .update(s.material.id, { availableAt: new Date(Date.now() + 60000) });
    if (gate === 'file-failed')
      await expect(
        db.getRepository(FileObjectEntity).update(s.material.fileObjectId, { status: 'FAILED' }),
      ).rejects.toMatchObject({ code: '23514' });
    if (gate === 'file-deleted')
      await expect(
        db
          .getRepository(FileObjectEntity)
          .update(s.material.fileObjectId, { deletedAt: new Date() }),
      ).rejects.toMatchObject({ code: '23514' });
    if (gate === 'wrong-file-scope') {
      const other = await setup();
      await expect(
        db
          .getRepository(MaterialEntity)
          .update(s.material.id, { fileObjectId: other.material.fileObjectId }),
      ).rejects.toMatchObject({ code: '23514' });
    }
    if (gate === 'wrong-kind')
      await expect(
        db
          .getRepository(MaterialEntity)
          .update(s.material.id, { contentType: MaterialContentType.VIDEO }),
      ).rejects.toMatchObject({ code: '23514' });
    // Typed migration prevents these corrupt states. Unpublish still revokes valid reads.
    if (['file-failed', 'file-deleted', 'wrong-file-scope', 'wrong-kind'].includes(gate)) {
      expect((await reads.detail(s.principal, s.classId, s.material.id)).file?.status).toBe(
        'READY',
      );
      await db.getRepository(MaterialEntity).update(s.material.id, { publishedAt: null });
    }
    expect(
      (await reads.list(s.principal, s.classId, s.unit.id, { page: 1, pageSize: 20 })).total,
    ).toBe(0);
    await expect(reads.detail(s.principal, s.classId, s.material.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(reads.download(s.principal, s.classId, s.material.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rejects suspended/stale roles and honors metadata while storage is disabled', async () => {
    const s = await setup();
    await s.activate();
    await db
      .getRepository(FileMetadataEntity)
      .update(s.material.fileObjectId, { processingStatus: 'FAILED' });
    expect((await reads.detail(s.principal, s.classId, s.material.id)).file?.status).toBe('READY');
    config.set('MINIO_ENABLED', false);
    try {
      expect(
        (await reads.list(s.principal, s.classId, s.unit.id, { page: 1, pageSize: 20 })).total,
      ).toBe(1);
      await expect(reads.download(s.principal, s.classId, s.material.id)).rejects.toMatchObject({
        status: 503,
      });
    } finally {
      config.set('MINIO_ENABLED', true);
    }
    await db.getRepository(UserEntity).update(s.principal.userId, { status: UserStatus.SUSPENDED });
    await expect(reads.detail(s.principal, s.classId, s.material.id)).rejects.toMatchObject({
      status: 403,
    });
    await db
      .getRepository(UserEntity)
      .update(s.principal.userId, { status: UserStatus.ACTIVE, role: UserRole.MENTOR });
    await expect(reads.download(s.principal, s.classId, s.material.id)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('signs the pinned version, supports Range, and expires without exposing staging bytes', async () => {
    const s = await setup();
    await s.activate();
    const file = await db
      .getRepository(FileObjectEntity)
      .findOneByOrFail({ id: s.material.fileObjectId });
    await remote.client.send(
      new PutObjectCommand({
        Bucket: file.bucket,
        Key: file.objectKey ?? '',
        Body: Buffer.from('new unverified version'),
      }),
    );
    const signed = await reads.download(s.principal, s.classId, s.material.id);
    expect(new URL(signed.url).searchParams.get('versionId')).toBe(file.objectVersionId);
    expect(new URL(signed.url).searchParams.get('X-Amz-Expires')).toBe('2');
    const full = await fetch(signed.url);
    expect(full.status).toBe(200);
    expect(Buffer.from(await full.arrayBuffer())).toEqual(bytes);
    expect(full.headers.get('cache-control')).toBe('private, no-store');
    expect(full.headers.get('content-disposition')).toContain("filename*=UTF-8''");
    const range = await fetch(signed.url, { headers: { range: 'bytes=0-7' } });
    expect(range.status).toBe(206);
    expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(0, 8));
    await new Promise((resolve) => setTimeout(resolve, 3100));
    expect((await fetch(signed.url)).status).toBe(403);
    expect(
      (await fetch((await reads.download(s.principal, s.classId, s.material.id)).url)).status,
    ).toBe(200);
  }, 15000);

  it('rechecks publication after signing and maps signing failures to 503', async () => {
    const s = await setup();
    await s.activate();
    const failure = vi
      .spyOn(remote.storage, 'presignGet')
      .mockRejectedValue(new Error('signing failure'));
    await expect(reads.download(s.principal, s.classId, s.material.id)).rejects.toMatchObject({
      status: 503,
    });
    failure.mockRestore();
    const sign = files.signReadReference.bind(files);
    vi.spyOn(files, 'signReadReference').mockImplementation(async (id, unitId) => {
      const signed = await sign(id, unitId);
      await db.getRepository(MaterialEntity).update(s.material.id, { publishedAt: null });
      return signed;
    });
    await expect(reads.download(s.principal, s.classId, s.material.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  async function readyFile(courseUnitId: string, filename: string, mimeType: string, data: Buffer) {
    const intent = await files.createIntent(manager, {
      courseUnitId,
      originalFilename: filename,
      declaredMimeType: mimeType,
      declaredSizeBytes: data.length,
    });
    await upload(intent.uploadUrl, mimeType, data);
    await files.complete(manager, intent.fileId);
    const worker = new FileProcessingService(db, config, remote.storage, {
      validate: validateBinary,
    });
    const claim = await worker.claim();
    if (!claim) throw new Error('Missing validation claim');
    await worker.process(claim);
    expect((await files.detail(manager, intent.fileId)).status).toBe('READY');
    return intent.fileId;
  }

  async function article(s: Awaited<ReturnType<typeof setup>>) {
    const png = (await binaryFixtures()).find((item) => item.filename === 'image.png');
    if (!png) throw new Error('Missing PNG fixture');
    const imageId = await readyFile(s.unit.courseUnitId, png.filename, png.mimeType, png.bytes);
    const approvedAt = new Date(Date.now() - 1000);
    const saved = await db.getRepository(MaterialEntity).save(
      db.getRepository(MaterialEntity).create({
        ...s.material,
        id: undefined,
        fileObjectId: null,
        contentType: MaterialContentType.ARTICLE,
        contentHtml: sanitizeArticle(`<p>Read</p><img data-file-id="${imageId}" alt="diagram">`)
          .contentHtml,
        contentSchemaVersion: 1,
        title: 'Article lesson',
        sortOrder: 1,
        reviewedAt: approvedAt,
        firstApprovedAt: approvedAt,
        publishedAt: approvedAt,
      }),
    );
    await db.getRepository(MaterialFileReferenceEntity).insert([
      { materialId: saved.id, fileId: imageId, role: MaterialReferenceRole.INLINE_IMAGE },
      {
        materialId: saved.id,
        fileId: s.material.fileObjectId,
        role: MaterialReferenceRole.ATTACHMENT,
      },
    ]);
    return { id: saved.id, imageId, attachmentId: s.material.fileObjectId };
  }

  it('ARTICLE detail exposes sanitized HTML and signs only its own inline/attachment files', async () => {
    const s = await setup();
    await s.activate();
    const a = await article(s);
    const page = await reads.list(s.principal, s.classId, s.unit.id, { page: 1, pageSize: 20 });
    expect(page.total).toBe(2);
    const item = page.items.find((entry) => entry.material.id === a.id);
    if (!item) throw new Error('Missing article item');
    const summary = new StudentMaterialDto(item);
    expect(summary).toMatchObject({ contentType: 'ARTICLE', file: null, attachmentCount: 1 });
    expect(summary).not.toHaveProperty('contentHtml');
    const detail = new StudentMaterialDetailDto(await reads.detail(s.principal, s.classId, a.id));
    expect(detail).toMatchObject({
      contentSchemaVersion: 1,
      inlineImages: [{ id: a.imageId, kind: 'IMAGE' }],
      attachments: [{ id: a.attachmentId }],
    });
    expect(detail.contentHtml).toContain(`data-file-id="${a.imageId}"`);
    expect(detail.contentHtml).not.toContain('src=');

    const inline = await reads.access(s.principal, s.classId, a.id, a.imageId);
    expect(inline).toMatchObject({ role: 'INLINE_IMAGE', revision: 1 });
    const image = await fetch(inline.url);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('content-disposition')).toMatch(/^inline;/);
    const attachment = await reads.access(s.principal, s.classId, a.id, a.attachmentId);
    expect(attachment.role).toBe('ATTACHMENT');
    expect((await fetch(attachment.url)).headers.get('content-disposition')).toMatch(
      /^attachment;/,
    );
    // The same file is the primary of another visible material, but not of this ARTICLE.
    await expect(reads.download(s.principal, s.classId, a.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      reads.access(s.principal, s.classId, s.material.id, a.imageId),
    ).rejects.toMatchObject({ status: 404 });
    expect((await reads.access(s.principal, s.classId, s.material.id, a.attachmentId)).role).toBe(
      'PRIMARY',
    );

    const sign = files.signReadReference.bind(files);
    const spy = vi.spyOn(files, 'signReadReference').mockImplementation(async (...args) => {
      const signed = await sign(...args);
      await db
        .getRepository(MaterialFileReferenceEntity)
        .delete({ materialId: a.id, role: MaterialReferenceRole.ATTACHMENT });
      return signed;
    });
    try {
      await expect(
        reads.access(s.principal, s.classId, a.id, a.attachmentId),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      spy.mockRestore();
    }
  }, 30000);

  it('hides ARTICLE with a broken reference before total/page and denies its assets', async () => {
    const s = await setup();
    await s.activate();
    const a = await article(s);
    // DB triggers normally protect referenced files; bypass only in this isolated test DB.
    await db.query('ALTER TABLE file_objects DISABLE TRIGGER trg_referenced_file');
    try {
      await db.query("UPDATE file_objects SET status='FAILED' WHERE id=$1", [a.imageId]);
    } finally {
      await db.query('ALTER TABLE file_objects ENABLE TRIGGER trg_referenced_file');
    }
    const page = await reads.list(s.principal, s.classId, s.unit.id, { page: 1, pageSize: 1 });
    expect(page.total).toBe(1);
    expect(page.items.map((item) => item.material.id)).toEqual([s.material.id]);
    await expect(reads.detail(s.principal, s.classId, a.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(reads.access(s.principal, s.classId, a.id, a.attachmentId)).rejects.toMatchObject({
      status: 404,
    });
  }, 30000);

  it('enforces revision approval and soft-delete constraints', async () => {
    const s = await setup();
    await expect(
      db.getRepository(MaterialEntity).update(s.material.id, { approvedRevision: 2 }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.getRepository(MaterialEntity).update(s.material.id, { approvedRevision: null }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.getRepository(MaterialEntity).update(s.material.id, { deletedAt: new Date() }),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
