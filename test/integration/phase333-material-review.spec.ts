import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrivateFileUploads1791504000001 } from '../../src/database/migrations/1791504000001-private-file-uploads.js';
import { StudentMaterialReads1791763200000 } from '../../src/database/migrations/1791763200000-student-material-reads.js';
import { TypedManagerMaterials1791849600000 } from '../../src/database/migrations/1791849600000-typed-manager-materials.js';
import { MaterialPublicationWithdrawal1791853200000 } from '../../src/database/migrations/1791853200000-material-publication-withdrawal.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { CoursesService } from '../../src/modules/catalog/services/courses.service.js';
import { ClassEntity } from '../../src/modules/classes/entities/class.entity.js';
import { ClassSessionEntity } from '../../src/modules/classes/entities/class-session.entity.js';
import { ClassUnitEntity } from '../../src/modules/classes/entities/class-unit.entity.js';
import { ClassStatus } from '../../src/modules/classes/enums/class-status.enum.js';
import { ClassContentContextService } from '../../src/modules/classes/services/class-content-context.service.js';
import { MentorContentContextService } from '../../src/modules/classes/services/mentor-content-context.service.js';
import { FileObjectEntity } from '../../src/modules/files/entities/file-object.entity.js';
import type { FileKind } from '../../src/modules/files/files.contracts.js';
import { FileUploadPolicyService } from '../../src/modules/files/services/file-upload-policy.service.js';
import { FilesService } from '../../src/modules/files/services/files.service.js';
import { MaterialReviewStatus } from '../../src/modules/materials/domain/material-contract.js';
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
import { paymentDatabase, paymentFixture } from '../helpers/payment-fixture.js';

describe('Phase 3.3.3 Review/publication + PostgreSQL', () => {
  let db: DataSource;
  let fixture: ReturnType<typeof paymentFixture>;
  let service: MaterialAuthoringService;
  let pickers: MentorContentContextService;
  let contexts: ClassContentContextService;
  let files: FilesService;
  let manager: AuthenticatedUser;
  const page = { page: 1, pageSize: 20 };
  const article = {
    contentType: MaterialContentType.ARTICLE,
    title: 'Lesson',
    contentHtml: '<p>Knowledge</p>',
  };
  const storage = () => {
    throw new Error('Metadata must not call storage');
  };
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('Dedicated TEST_DATABASE_URL required');
    db = await paymentDatabase('review_materials', {
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
        MaterialPublicationWithdrawal1791853200000,
      ],
    });
    fixture = paymentFixture(db);
    const user = await fixture.user(UserRole.MANAGER);
    manager = { userId: user.id, role: user.role, sessionId: randomUUID() };
    const courses = new CoursesService(db);
    contexts = new ClassContentContextService(db);
    pickers = new MentorContentContextService(
      db,
      fixture.workspace,
      fixture.users,
      courses,
      contexts,
    );
    const uploads = new FileUploadPolicyService(fixture.users, courses, contexts);
    files = new FilesService(db, fileConfig({ MINIO_ENABLED: false }), uploads, {
      assertAvailable: storage,
      presignPut: storage,
      presignGet: storage,
      head: storage,
      copy: storage,
      read: storage,
    });
    service = new MaterialAuthoringService(
      db,
      new MaterialPolicyService(fixture.users, courses, contexts, fixture.enrollments, uploads),
      files,
      courses,
      contexts,
      pickers,
    );
  }, 60000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function setup(count = 1) {
    const order = await fixture.order({ count });
    const classId = order.classIds[0];
    if (!classId) throw new Error('Missing class');
    const unit = await db.getRepository(ClassUnitEntity).findOneByOrFail({ classId, position: 1 });
    const actor = { userId: order.mentor.id, role: UserRole.MENTOR, sessionId: randomUUID() };
    const scope = { classId, classUnitId: unit.id };
    return { order, unit, actor, scope };
  }
  async function ready(
    unitId: string,
    actor: AuthenticatedUser,
    classId: string,
    classUnitId: string,
    kind: FileKind = 'PDF',
  ) {
    const mime =
      kind === 'VIDEO' ? 'video/mp4' : kind === 'IMAGE' ? 'image/png' : 'application/pdf';
    const extension = kind === 'VIDEO' ? '.mp4' : kind === 'IMAGE' ? '.png' : '.pdf';
    return db.getRepository(FileObjectEntity).save({
      ownerUserId: actor.userId,
      courseUnitId: unitId,
      intentClassId: classId,
      intentClassUnitId: classUnitId,
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
  async function draft(s: Awaited<ReturnType<typeof setup>>) {
    return service.create(s.actor, s.unit.id, article, s.scope);
  }
  async function pending(s: Awaited<ReturnType<typeof setup>>) {
    const created = await draft(s);
    return service.submit(s.actor, created.id, 1, s.scope);
  }
  async function audit(id: string) {
    return db.getRepository(MaterialAuditEventEntity).find({
      where: { materialId: id },
      order: { occurredAt: 'ASC', id: 'ASC' },
    });
  }

  it('locks Manager identity and session context until the decision commits', async () => {
    const s = await setup();
    const session = await db
      .getRepository(ClassSessionEntity)
      .findOneByOrFail({ classUnitId: s.unit.id });
    const created = await service.create(
      s.actor,
      s.unit.id,
      { ...article, sessionId: session.id },
      s.scope,
    );
    await service.submit(s.actor, created.id, 1, s.scope);
    const user = await fixture.user(UserRole.MANAGER);
    const principal = { userId: user.id, role: user.role, sessionId: randomUUID() };
    const original = files.assertReadyReferences.bind(files);
    let entered!: () => void;
    let resume!: () => void;
    const locked = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    vi.spyOn(files, 'assertReadyReferences').mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      entered();
      await gate;
      return result;
    });
    const approving = service.review(principal, created.id, {
      action: 'APPROVE',
      expectedRevision: 1,
    });
    await locked;
    let revoked = false;
    const revocation = db
      .transaction(async (tx) => {
        await tx.getRepository(UserEntity).update(user.id, { status: UserStatus.SUSPENDED });
        await tx
          .getRepository(ClassEntity)
          .update(s.scope.classId, { status: ClassStatus.CANCELLED });
      })
      .then(() => {
        revoked = true;
      });
    try {
      await db.query('SELECT pg_sleep(0.05)');
      expect(revoked).toBe(false);
    } finally {
      resume();
    }
    expect((await approving).reviewStatus).toBe('APPROVED');
    await revocation;
    await expect(
      service.review(principal, created.id, { action: 'UNPUBLISH', expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('filters the queue before pagination and returns safe summaries/detail', async () => {
    const s = await setup();
    const created = await pending(s);
    await draft(s);
    const queue = await service.list(manager, {
      ...page,
      pageSize: 1,
      courseUnitId: s.unit.courseUnitId,
      contentType: MaterialContentType.ARTICLE,
      reviewStatus: MaterialReviewStatus.PENDING_REVIEW,
    });
    expect(queue.total).toBe(1);
    expect(queue.items[0]).toMatchObject({ id: created.id, canEdit: true });
    expect(queue.items[0]).not.toHaveProperty('contentHtml');
    expect(queue.items[0]).not.toHaveProperty('attachments');
    expect(JSON.stringify(await service.detail(manager, created.id))).not.toMatch(
      /bucket|objectKey|signed|ownerUserId/,
    );
  });

  it('rejects, edits, resubmits and approves; first approval permanently removes Mentor editing', async () => {
    const s = await setup();
    const created = await pending(s);
    const rejected = await service.review(manager, created.id, {
      action: 'REJECT',
      expectedRevision: 1,
      reason: '  Add examples  ',
    });
    expect(rejected).toMatchObject({
      reviewStatus: 'REJECTED',
      rejectionReason: 'Add examples',
      revision: 1,
      approvedRevision: null,
      publishedAt: null,
      firstApprovedAt: null,
    });
    expect((await service.detail(s.actor, created.id, s.scope)).canEdit).toBe(true);
    expect(
      await service.review(manager, created.id, {
        action: 'REJECT',
        expectedRevision: 1,
        reason: 'Add examples',
      }),
    ).toEqual(rejected);
    await expect(
      service.review(manager, created.id, {
        action: 'REJECT',
        expectedRevision: 1,
        reason: 'Different reason',
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.submit(s.actor, created.id, 1, s.scope)).rejects.toMatchObject({
      status: 409,
    });
    await service.patch(
      s.actor,
      created.id,
      { expectedRevision: 1, title: 'With examples' },
      s.scope,
    );
    await service.submit(s.actor, created.id, 2, s.scope);
    const approved = await service.review(manager, created.id, {
      action: 'APPROVE',
      expectedRevision: 2,
    });
    expect(approved).toMatchObject({
      reviewStatus: 'APPROVED',
      revision: 2,
      approvedRevision: 2,
      rejectionReason: null,
      reviewedBy: manager.userId,
    });
    expect(approved.publishedAt).toEqual(approved.firstApprovedAt);
    expect((await service.detail(s.actor, created.id, s.scope)).canEdit).toBe(false);
    const edited = await service.patch(manager, created.id, {
      expectedRevision: 2,
      title: approved.title,
    });
    expect(edited).toMatchObject({
      revision: 3,
      reviewStatus: 'DRAFT',
      reviewedAt: null,
      approvedRevision: null,
      publishedAt: null,
      firstApprovedAt: approved.firstApprovedAt,
    });
    for (const action of [
      () =>
        service.patch(s.actor, created.id, { expectedRevision: 3, title: 'Mentor edit' }, s.scope),
      () => service.submit(s.actor, created.id, 3, s.scope),
      () => service.delete(s.actor, created.id, 3, s.scope),
    ])
      await expect(action()).rejects.toMatchObject({ status: 403 });
    const reapproved = await service.review(manager, created.id, {
      action: 'APPROVE',
      expectedRevision: 3,
    });
    expect(reapproved.firstApprovedAt).toEqual(approved.firstApprovedAt);
    expect((await audit(created.id)).map((event) => event.action)).toEqual([
      'CREATE',
      'SUBMIT',
      'REJECT',
      'EDIT',
      'SUBMIT',
      'APPROVE',
      'EDIT',
      'APPROVE',
    ]);
  });

  it('approves own Manager drafts, blocks other Manager and unsubmitted Mentor drafts', async () => {
    const s = await setup();
    const mentorDraft = await draft(s);
    await expect(
      service.review(manager, mentorDraft.id, { action: 'APPROVE', expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    const direct = await service.create(manager, s.unit.courseUnitId, article);
    const other = await fixture.user(UserRole.MANAGER);
    await expect(
      service.review({ userId: other.id, role: other.role, sessionId: randomUUID() }, direct.id, {
        action: 'APPROVE',
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.review(manager, direct.id, { action: 'REJECT', expectedRevision: 1, reason: 'No' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.review(manager, direct.id, { action: 'PUBLISH', expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await service.review(manager, direct.id, { action: 'APPROVE', expectedRevision: 1 }))
        .reviewStatus,
    ).toBe('APPROVED');
  });

  it('serializes concurrent approvals and no-op publication retries without duplicate audit or timestamps', async () => {
    const s = await setup();
    const created = await pending(s);
    const results = await Promise.all([
      service.review(manager, created.id, { action: 'APPROVE', expectedRevision: 1 }),
      service.review(manager, created.id, { action: 'APPROVE', expectedRevision: 1 }),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(await audit(created.id)).toHaveLength(3);
    const hidden = await service.review(manager, created.id, {
      action: 'UNPUBLISH',
      expectedRevision: 1,
    });
    expect(hidden).toMatchObject({
      publishedAt: null,
      approvedRevision: 1,
      firstApprovedAt: results[0]?.firstApprovedAt,
    });
    expect(
      await service.review(manager, created.id, { action: 'APPROVE', expectedRevision: 1 }),
    ).toEqual(hidden);
    expect(
      await service.review(manager, created.id, { action: 'UNPUBLISH', expectedRevision: 1 }),
    ).toEqual(hidden);
    const published = await service.review(manager, created.id, {
      action: 'PUBLISH',
      expectedRevision: 1,
    });
    expect(published.publishedAt).not.toBeNull();
    expect(
      await service.review(manager, created.id, { action: 'PUBLISH', expectedRevision: 1 }),
    ).toEqual(published);
    await service.review(manager, created.id, { action: 'UNPUBLISH', expectedRevision: 1 });
    await service.review(manager, created.id, { action: 'PUBLISH', expectedRevision: 1 });
    expect((await audit(created.id)).map((event) => event.action)).toEqual([
      'CREATE',
      'SUBMIT',
      'APPROVE',
      'UNPUBLISH',
      'PUBLISH',
      'UNPUBLISH',
      'PUBLISH',
    ]);
  });

  it('approve/reject races produce exactly one decision and one conflict', async () => {
    const s = await setup();
    const created = await pending(s);
    const results = await Promise.allSettled([
      service.review(manager, created.id, { action: 'APPROVE', expectedRevision: 1 }),
      service.review(manager, created.id, {
        action: 'REJECT',
        expectedRevision: 1,
        reason: 'Review again',
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    });
    expect(await audit(created.id)).toHaveLength(3);
  });

  it.each(['APPROVE', 'REJECT'] as const)(
    'PATCH races with %s cannot approve stale content',
    async (action) => {
      const s = await setup();
      const created = await pending(s);
      const decision =
        action === 'REJECT'
          ? { action, expectedRevision: 1, reason: 'Needs work' }
          : { action, expectedRevision: 1 };
      const results = await Promise.allSettled([
        service.patch(manager, created.id, {
          expectedRevision: 1,
          contentHtml: '<p>New revision</p>',
        }),
        service.review(manager, created.id, decision),
      ]);
      expect(results[0]?.status).toBe('fulfilled');
      const current = await service.detail(manager, created.id);
      expect(current).toMatchObject({
        revision: 2,
        contentHtml: '<p>New revision</p>',
        reviewStatus: 'DRAFT',
        approvedRevision: null,
        publishedAt: null,
      });
      await expect(service.review(manager, created.id, decision)).rejects.toMatchObject({
        status: 409,
      });
    },
  );

  it('Manager can review submissions after assignment revocation and cancellation', async () => {
    const s = await setup();
    const file = await ready(s.unit.courseUnitId, s.actor, s.scope.classId, s.unit.id);
    const created = await service.create(
      s.actor,
      s.unit.id,
      { ...article, attachmentFileIds: [file.id] },
      s.scope,
    );
    await service.submit(s.actor, created.id, 1, s.scope);
    await db
      .getRepository(ClassEntity)
      .update(s.scope.classId, { mentorId: manager.userId, status: ClassStatus.CANCELLED });
    expect(
      (await service.review(manager, created.id, { action: 'APPROVE', expectedRevision: 1 }))
        .reviewStatus,
    ).toBe('APPROVED');
    await expect(service.detail(s.actor, created.id, s.scope)).rejects.toMatchObject({
      status: 403,
    });
  });

  it.each(['PDF', 'VIDEO'] as const)(
    'reviews typed %s primary, inline and attachment references without storage',
    async (kind) => {
      const s = await setup();
      const file = await ready(s.unit.courseUnitId, s.actor, s.scope.classId, s.unit.id, kind);
      const created = await service.create(
        s.actor,
        s.unit.id,
        {
          title: 'Binary',
          contentType: kind === 'VIDEO' ? MaterialContentType.VIDEO : MaterialContentType.FILE,
          fileId: file.id,
        },
        s.scope,
      );
      await service.submit(s.actor, created.id, 1, s.scope);
      const refsBefore = await db
        .getRepository(MaterialFileReferenceEntity)
        .findBy({ materialId: created.id });
      const approved = await service.review(manager, created.id, {
        action: 'APPROVE',
        expectedRevision: 1,
      });
      expect(approved.file?.id).toBe(file.id);
      expect(
        await db.getRepository(MaterialFileReferenceEntity).findBy({ materialId: created.id }),
      ).toEqual(refsBefore);
    },
  );

  it.each(['APPROVE', 'REJECT', 'PUBLISH'] as const)(
    '%s verifies every READY reference, but unpublish remains available',
    async (action) => {
      const s = await setup();
      const image = await ready(s.unit.courseUnitId, s.actor, s.scope.classId, s.unit.id, 'IMAGE');
      const attachment = await ready(s.unit.courseUnitId, s.actor, s.scope.classId, s.unit.id);
      const created = await service.create(
        s.actor,
        s.unit.id,
        {
          ...article,
          contentHtml: `<p>Image</p><img data-file-id="${image.id}">`,
          attachmentFileIds: [attachment.id],
        },
        s.scope,
      );
      await service.submit(s.actor, created.id, 1, s.scope);
      if (action === 'PUBLISH')
        await service.review(manager, created.id, { action: 'APPROVE', expectedRevision: 1 });
      // Cross-table protection correctly prevents normal READY revocation; disable only in this isolated fixture.
      await db.query('ALTER TABLE file_objects DISABLE TRIGGER USER');
      try {
        await db.getRepository(FileObjectEntity).update(attachment.id, { status: 'FAILED' });
      } finally {
        await db.query('ALTER TABLE file_objects ENABLE TRIGGER USER');
      }
      const before = await service.detail(manager, created.id);
      const command =
        action === 'REJECT'
          ? { action, expectedRevision: 1, reason: 'Check file' }
          : { action, expectedRevision: 1 };
      await expect(service.review(manager, created.id, command)).rejects.toMatchObject({
        status: 409,
      });
      expect(await service.detail(manager, created.id)).toEqual(before);
      expect(
        (await service.review(manager, created.id, { action: 'UNPUBLISH', expectedRevision: 1 }))
          .publishedAt,
      ).toBeNull();
    },
  );

  it('denies Mentor/Admin/inactive/role-changed managers and returns 404 for tombstones', async () => {
    const s = await setup();
    const created = await pending(s);
    await expect(
      service.review(s.actor, created.id, { action: 'APPROVE', expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 403 });
    const admin = await fixture.user(UserRole.ADMIN);
    await expect(
      service.review({ userId: admin.id, role: admin.role, sessionId: randomUUID() }, created.id, {
        action: 'APPROVE',
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });
    const user = await fixture.user(UserRole.MANAGER);
    const principal = { userId: user.id, role: user.role, sessionId: randomUUID() };
    await db.getRepository(UserEntity).update(user.id, { status: UserStatus.SUSPENDED });
    await expect(
      service.review(principal, created.id, { action: 'APPROVE', expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 403 });
    await db
      .getRepository(UserEntity)
      .update(user.id, { status: UserStatus.ACTIVE, role: UserRole.MENTOR });
    await expect(
      service.review(principal, created.id, { action: 'APPROVE', expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 403 });
    await service.delete(manager, created.id, 1);
    await expect(
      service.review(manager, created.id, { action: 'APPROVE', expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rolls back decision/publication when audit insertion fails', async () => {
    const s = await setup();
    const created = await pending(s);
    const before = await service.detail(manager, created.id);
    await db.query(
      "CREATE FUNCTION fail_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'review audit failure'; END $$",
    );
    await db.query(
      'CREATE TRIGGER fail_review_audit BEFORE INSERT ON material_audit_events FOR EACH ROW EXECUTE FUNCTION fail_review_audit()',
    );
    try {
      await expect(
        service.review(manager, created.id, { action: 'APPROVE', expectedRevision: 1 }),
      ).rejects.toThrow('review audit failure');
    } finally {
      await db.query('DROP TRIGGER fail_review_audit ON material_audit_events');
      await db.query('DROP FUNCTION fail_review_audit()');
    }
    expect(await service.detail(manager, created.id)).toEqual(before);
    expect(await audit(created.id)).toHaveLength(2);
  });

  it('migration down/up preserves data and withdrawal bypass cannot alter content or first approval', async () => {
    const s = await setup();
    const created = await pending(s);
    await service.review(manager, created.id, { action: 'APPROVE', expectedRevision: 1 });
    await expect(
      db.query('UPDATE materials SET first_approved_at=now(),published_at=NULL WHERE id=$1', [
        created.id,
      ]),
    ).rejects.toThrow('Immutable material identity/approval');
    const before = await service.detail(manager, created.id);
    await db.undoLastMigration();
    expect(await service.detail(manager, created.id)).toEqual(before);
    expect(await db.runMigrations()).toHaveLength(1);
    expect(await service.detail(manager, created.id)).toEqual(before);
    expect(
      (await service.review(manager, created.id, { action: 'UNPUBLISH', expectedRevision: 1 }))
        .publishedAt,
    ).toBeNull();
  });
});
