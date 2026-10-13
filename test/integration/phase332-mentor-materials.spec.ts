import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrivateFileUploads1791504000001 } from '../../src/database/migrations/1791504000001-private-file-uploads.js';
import { StudentMaterialReads1791763200000 } from '../../src/database/migrations/1791763200000-student-material-reads.js';
import { TypedManagerMaterials1791849600000 } from '../../src/database/migrations/1791849600000-typed-manager-materials.js';
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

describe('Phase 3.3.2 Mentor submission + PostgreSQL', () => {
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
    db = await paymentDatabase('mentor_materials', {
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
    fixture = paymentFixture(db);
    const user = await fixture.user(UserRole.MANAGER);
    manager = { userId: user.id, role: user.role, sessionId: randomUUID() };
    const courses = new CoursesService(db);
    contexts = new ClassContentContextService(db);
    pickers = new MentorContentContextService(db, fixture.users, courses, contexts);
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
  async function approve(id: string) {
    const now = new Date();
    await db.getRepository(MaterialEntity).update(id, {
      reviewStatus: MaterialReviewStatus.APPROVED,
      approvedRevision: 1,
      reviewedBy: manager.userId,
      reviewedAt: now,
      firstApprovedAt: now,
      publishedAt: now,
    });
  }

  it('maps Class Unit/course Unit/session IDs, paginates and never exposes meeting URLs', async () => {
    const s = await setup();
    const units = await pickers.units(s.actor, s.scope.classId, { page: 1, pageSize: 1 });
    expect(units).toMatchObject({
      total: 2,
      pageSize: 1,
      items: [
        { id: s.unit.id, courseUnitId: s.unit.courseUnitId, title: 'Unit one', status: 'LOCKED' },
      ],
    });
    const sessions = await pickers.sessions(s.actor, s.scope.classId, s.unit.id, page);
    expect(sessions.total).toBe(1);
    expect(sessions.items[0]).toMatchObject({
      classUnitId: s.unit.id,
      sessionNumber: 1,
      title: 'Session one',
    });
    expect(JSON.stringify(sessions)).not.toMatch(/meeting|room|enrollment/);
    const emptyUnit = (await pickers.units(s.actor, s.scope.classId, { page: 2, pageSize: 1 }))
      .items[0];
    if (!emptyUnit) throw new Error('Missing second unit');
    expect((await pickers.sessions(s.actor, s.scope.classId, emptyUnit.id, page)).total).toBe(0);
    const other = await setup();
    await expect(
      pickers.sessions(s.actor, s.scope.classId, other.unit.id, page),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('creates canonical ARTICLE text-only with provenance and CREATE audit, submits without changing revision', async () => {
    const s = await setup();
    const session = await db
      .getRepository(ClassSessionEntity)
      .findOneByOrFail({ classUnitId: s.unit.id });
    const created = await service.create(
      s.actor,
      s.unit.id,
      { ...article, sessionId: session.id, contentHtml: '<p onclick="bad()">Knowledge</p>' },
      s.scope,
    );
    expect(created).toMatchObject({
      courseUnitId: s.unit.courseUnitId,
      createdInClassId: s.scope.classId,
      contentHtml: '<p>Knowledge</p>',
      file: null,
      canEdit: true,
      revision: 1,
    });
    const submitted = await service.submit(s.actor, created.id, 1, s.scope);
    expect(submitted).toMatchObject({
      reviewStatus: 'PENDING_REVIEW',
      revision: 1,
      canEdit: false,
    });
    expect(await service.submit(s.actor, created.id, 1, s.scope)).toEqual(submitted);
    expect(
      await db.getRepository(MaterialAuditEventEntity).countBy({ materialId: created.id }),
    ).toBe(2);
    expect(JSON.stringify(submitted)).not.toMatch(/bucket|staging|objectKey|signed|ownerUserId/);
  });

  it.each(['PDF', 'VIDEO', 'IMAGE'] as const)(
    'creates and submits own READY %s typed references',
    async (kind) => {
      const s = await setup();
      const file = await ready(s.unit.courseUnitId, s.actor, s.scope.classId, s.unit.id, kind);
      const input =
        kind === 'IMAGE'
          ? {
              ...article,
              contentHtml: `<img data-file-id="${file.id}">`,
              attachmentFileIds: [file.id],
            }
          : {
              contentType: kind === 'VIDEO' ? MaterialContentType.VIDEO : MaterialContentType.FILE,
              title: kind,
              fileId: file.id,
            };
      const created = await service.create(s.actor, s.unit.id, input, s.scope);
      const submitted = await service.submit(s.actor, created.id, 1, s.scope);
      expect(submitted.reviewStatus).toBe('PENDING_REVIEW');
      expect(kind === 'IMAGE' ? submitted.inlineImages[0]?.id : submitted.file?.id).toBe(file.id);
    },
  );

  it('filters hidden drafts before count/page, reads shared published metadata despite release/time/session gates', async () => {
    const s = await setup(2);
    const otherClassId = s.order.classIds[1];
    if (!otherClassId) throw new Error('Missing second class');
    const otherUnit = await db
      .getRepository(ClassUnitEntity)
      .findOneByOrFail({ classId: otherClassId, courseUnitId: s.unit.courseUnitId });
    const foreign = await service.create(
      s.actor,
      otherUnit.id,
      { ...article, sortOrder: 0 },
      { classId: otherClassId, classUnitId: otherUnit.id },
    );
    const hidden = await service.create(manager, s.unit.courseUnitId, { ...article, sortOrder: 0 });
    const shared = await service.create(manager, s.unit.courseUnitId, {
      ...article,
      sortOrder: 2,
      availableAt: '2099-01-01T00:00:00Z',
    });
    await approve(shared.id);
    const own = await service.create(s.actor, s.unit.id, { ...article, sortOrder: 1 }, s.scope);
    await service.submit(s.actor, own.id, 1, s.scope);
    const list = await service.list(s.actor, { page: 1, pageSize: 1 }, s.unit.id, s.scope);
    expect(list).toMatchObject({ total: 2, items: [{ id: own.id, canEdit: false }] });
    expect(list.items[0]).not.toHaveProperty('contentHtml');
    expect(
      (await service.list(s.actor, { page: 2, pageSize: 1 }, s.unit.id, s.scope)).items[0]?.id,
    ).toBe(shared.id);
    expect(await service.detail(s.actor, shared.id, s.scope)).toMatchObject({
      canEdit: false,
      rejectionReason: null,
    });
    for (const id of [foreign.id, hidden.id])
      await expect(service.detail(s.actor, id, s.scope)).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await service.list(
          s.actor,
          { ...page, reviewStatus: MaterialReviewStatus.DRAFT },
          s.unit.id,
          s.scope,
        )
      ).total,
    ).toBe(0);
  });

  it('REJECTED requires EDIT before resubmit; pending and ever-approved never regain edit/delete/submit rights', async () => {
    const s = await setup();
    const created = await draft(s);
    await service.submit(s.actor, created.id, 1, s.scope);
    await expect(
      service.patch(s.actor, created.id, { expectedRevision: 1, title: 'changed' }, s.scope),
    ).rejects.toMatchObject({ status: 403 });
    await expect(service.delete(s.actor, created.id, 1, s.scope)).rejects.toMatchObject({
      status: 403,
    });
    await db.getRepository(MaterialEntity).update(created.id, {
      reviewStatus: MaterialReviewStatus.REJECTED,
      reviewedBy: manager.userId,
      reviewedAt: new Date(),
      rejectionReason: 'Add examples',
    });
    expect(await service.detail(s.actor, created.id, s.scope)).toMatchObject({
      canEdit: true,
      rejectionReason: 'Add examples',
    });
    await expect(service.submit(s.actor, created.id, 1, s.scope)).rejects.toMatchObject({
      status: 409,
    });
    const edited = await service.patch(
      s.actor,
      created.id,
      { expectedRevision: 1, title: 'changed' },
      s.scope,
    );
    expect(edited).toMatchObject({ revision: 2, reviewStatus: 'DRAFT', rejectionReason: null });
    await expect(
      service.patch(s.actor, created.id, { expectedRevision: 1, title: 'stale' }, s.scope),
    ).rejects.toMatchObject({ status: 409 });
    await service.submit(s.actor, created.id, 2, s.scope);
    const now = new Date();
    await db.getRepository(MaterialEntity).update(created.id, {
      reviewStatus: MaterialReviewStatus.APPROVED,
      approvedRevision: 2,
      reviewedBy: manager.userId,
      reviewedAt: now,
      firstApprovedAt: now,
      publishedAt: now,
    });
    await service.patch(manager, created.id, { expectedRevision: 2, title: 'Manager edit' });
    for (const mutation of [
      () =>
        service.patch(s.actor, created.id, { expectedRevision: 3, title: 'forbidden' }, s.scope),
      () => service.delete(s.actor, created.id, 3, s.scope),
      () => service.submit(s.actor, created.id, 3, s.scope),
    ])
      await expect(mutation()).rejects.toMatchObject({ status: 403 });
    await expect(service.detail(s.actor, created.id, s.scope)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('soft delete retries keep refs/binary and audit; another class/actor cannot mutate', async () => {
    const s = await setup(2);
    const created = await draft(s);
    const otherId = s.order.classIds[1];
    if (!otherId) throw new Error('Missing second class');
    await expect(
      service.delete(s.actor, created.id, 1, { classId: otherId }),
    ).rejects.toMatchObject({ status: 403 });
    const otherActor = await fixture.user(UserRole.MENTOR);
    await expect(
      service.detail({ ...s.actor, userId: otherActor.id }, created.id, s.scope),
    ).rejects.toMatchObject({ status: 403 });
    await service.delete(s.actor, created.id, 1, s.scope);
    await service.delete(s.actor, created.id, 1, s.scope);
    expect(
      await db.getRepository(MaterialAuditEventEntity).countBy({ materialId: created.id }),
    ).toBe(2);
    await expect(service.delete(s.actor, created.id, 2, s.scope)).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.detail(s.actor, created.id, s.scope)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rejects foreign files/sessions and stale upload assignment; rollback preserves previous references', async () => {
    const s = await setup(2);
    const other = await setup();
    const session = await db
      .getRepository(ClassSessionEntity)
      .findOneByOrFail({ classUnitId: other.unit.id });
    await expect(
      service.create(s.actor, s.unit.id, { ...article, sessionId: session.id }, s.scope),
    ).rejects.toMatchObject({ status: 404 });
    const managerFile = await ready(s.unit.courseUnitId, manager, s.scope.classId, s.unit.id);
    await expect(
      service.create(
        s.actor,
        s.unit.id,
        { ...article, attachmentFileIds: [managerFile.id] },
        s.scope,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const own = await ready(s.unit.courseUnitId, s.actor, s.scope.classId, s.unit.id);
    const created = await service.create(
      s.actor,
      s.unit.id,
      { ...article, attachmentFileIds: [own.id] },
      s.scope,
    );
    const bad = await ready(other.unit.courseUnitId, s.actor, other.scope.classId, other.unit.id);
    await expect(
      service.patch(
        s.actor,
        created.id,
        { expectedRevision: 1, attachmentFileIds: [bad.id] },
        s.scope,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect((await service.detail(s.actor, created.id, s.scope)).attachments[0]?.id).toBe(own.id);
    await db.getRepository(ClassEntity).update(s.scope.classId, { mentorId: other.actor.userId });
    await expect(service.submit(s.actor, created.id, 1, s.scope)).rejects.toMatchObject({
      status: 403,
    });
    expect((await service.detail(manager, created.id)).reviewStatus).toBe('DRAFT');
  });

  it.each(['reassign', 'cancel'] as const)(
    'serializes %s against text-only create and rechecks after waiting',
    async (change) => {
      const s = await setup();
      const other = await fixture.user(UserRole.MENTOR);
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await contexts.lockContentClass(s.scope.classId, runner.manager);
        const pending = draft(s);
        const rejection = expect(pending).rejects.toMatchObject({ status: 403 });
        await runner.manager
          .getRepository(ClassEntity)
          .update(
            s.scope.classId,
            change === 'cancel' ? { status: ClassStatus.CANCELLED } : { mentorId: other.id },
          );
        await runner.commitTransaction();
        await rejection;
        expect(
          await db.getRepository(MaterialEntity).countBy({ courseUnitId: s.unit.courseUnitId }),
        ).toBe(0);
        await expect(pickers.units(s.actor, s.scope.classId, page)).rejects.toMatchObject({
          status: 403,
        });
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
    },
  );

  it('rejects suspended/role-changed actors, including tombstone retries and metadata reads', async () => {
    const s = await setup();
    const created = await draft(s);
    await service.delete(s.actor, created.id, 1, s.scope);
    await db.getRepository(UserEntity).update(s.actor.userId, { status: UserStatus.SUSPENDED });
    await expect(service.delete(s.actor, created.id, 1, s.scope)).rejects.toMatchObject({
      status: 403,
    });
    await expect(pickers.units(s.actor, s.scope.classId, page)).rejects.toMatchObject({
      status: 403,
    });
    await db
      .getRepository(UserEntity)
      .update(s.actor.userId, { status: UserStatus.ACTIVE, role: UserRole.STUDENT });
    await expect(draft(s)).rejects.toMatchObject({ status: 403 });
  });

  it('actor and assignment revocation wait for an authorized mutation to commit', async () => {
    const s = await setup();
    const original = files.assertReadyReferences.bind(files);
    let entered: () => void = () => {};
    let resume: () => void = () => {};
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
    const creating = draft(s);
    await locked;
    let revoked = false;
    const revocation = db
      .transaction(async (tx) => {
        await tx.getRepository(UserEntity).update(s.actor.userId, { status: UserStatus.SUSPENDED });
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
    const created = await creating;
    await revocation;
    expect((await service.detail(manager, created.id)).reviewStatus).toBe('DRAFT');
    await expect(service.detail(s.actor, created.id, s.scope)).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.submit(s.actor, created.id, 1, s.scope)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('concurrent submits are no-op retries; EDIT versus SUBMIT never submits a stale revision', async () => {
    const s = await setup();
    const created = await draft(s);
    const submitted = await Promise.all([
      service.submit(s.actor, created.id, 1, s.scope),
      service.submit(s.actor, created.id, 1, s.scope),
    ]);
    expect(submitted[0]).toEqual(submitted[1]);
    expect(
      await db.getRepository(MaterialAuditEventEntity).countBy({ materialId: created.id }),
    ).toBe(2);
    const fresh = await draft(s);
    const raced = await Promise.allSettled([
      service.patch(s.actor, fresh.id, { expectedRevision: 1, title: 'edited' }, s.scope),
      service.submit(s.actor, fresh.id, 1, s.scope),
    ]);
    expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const current = await service.detail(manager, fresh.id);
    expect(
      (current.revision === 2 && current.reviewStatus === 'DRAFT') ||
        (current.revision === 1 && current.reviewStatus === 'PENDING_REVIEW'),
    ).toBe(true);
  });

  it('rolls back submission when audit write fails', async () => {
    const s = await setup();
    const created = await draft(s);
    await db.query(
      "CREATE FUNCTION fail_submit_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'submit audit failure'; END $$",
    );
    await db.query(
      'CREATE TRIGGER fail_submit_audit BEFORE INSERT ON material_audit_events FOR EACH ROW EXECUTE FUNCTION fail_submit_audit()',
    );
    try {
      await expect(service.submit(s.actor, created.id, 1, s.scope)).rejects.toThrow(
        'submit audit failure',
      );
    } finally {
      await db.query('DROP TRIGGER fail_submit_audit ON material_audit_events');
      await db.query('DROP FUNCTION fail_submit_audit()');
    }
    expect(await service.detail(s.actor, created.id, s.scope)).toEqual(created);
    expect(
      await db.getRepository(MaterialAuditEventEntity).countBy({ materialId: created.id }),
    ).toBe(1);
  });

  it('locks all file intent and submission Classes in sorted UUID order before authorization', async () => {
    const s = await setup(2);
    const otherClassId = s.order.classIds[1];
    if (!otherClassId) throw new Error('Missing second class');
    const otherUnit = await db
      .getRepository(ClassUnitEntity)
      .findOneByOrFail({ classId: otherClassId, courseUnitId: s.unit.courseUnitId });
    const file = await ready(s.unit.courseUnitId, s.actor, otherClassId, otherUnit.id);
    const spy = vi.spyOn(contexts, 'lockContentClass');
    const created = await service.create(
      s.actor,
      s.unit.id,
      { ...article, attachmentFileIds: [file.id] },
      s.scope,
    );
    expect(created.attachments[0]?.id).toBe(file.id);
    expect(spy.mock.calls.slice(0, 2).map((call) => call[0])).toEqual(
      [s.scope.classId, otherClassId].sort(),
    );
    await service.submit(s.actor, created.id, 1, s.scope);
    await db.getRepository(ClassEntity).update(otherClassId, { mentorId: manager.userId });
    await expect(service.submit(s.actor, created.id, 1, s.scope)).rejects.toMatchObject({
      status: 403,
    });
  });
});
