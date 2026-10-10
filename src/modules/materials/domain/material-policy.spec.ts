import { describe, expect, it } from 'vitest';
import type { ClassContentContext } from '../../classes/domain/class-content-context.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { ClassUnitStatus } from '../../classes/enums/class-unit-status.enum.js';
import { SessionStatus } from '../../classes/enums/session-status.enum.js';
import { UserRole } from '../../users/user-role.enum.js';
import { canManageOwnDraft, canPreviewMaterial, canReadMaterial } from './material-access.js';
import {
  type MaterialActor,
  type MaterialContent,
  type MaterialFileReference,
  MaterialReviewStatus,
  type MaterialSnapshot,
} from './material-contract.js';
import { validateMaterialFileDeclaration } from './material-file-policy.js';
import { applyMaterialCommand, createMaterialDraft } from './material-review.js';

const now = new Date('2026-10-09T08:00:00Z');
const future = new Date(now.getTime() + 1);
const manager: MaterialActor = { userId: 'manager', role: UserRole.MANAGER, active: true };
const mentor: MaterialActor = { userId: 'mentor', role: UserRole.MENTOR, active: true };
const student: MaterialActor = { userId: 'student', role: UserRole.STUDENT, active: true };
const context: ClassContentContext = {
  classId: 'class-A',
  courseId: 'course',
  mentorId: mentor.userId,
  classStatus: ClassStatus.OPEN,
  classUnitId: 'class-unit-A',
  courseUnitId: 'course-unit',
  unitStatus: ClassUnitStatus.OPEN,
  unlockAt: null,
  sessionId: null,
  sessionStatus: null,
};
const file: MaterialFileReference = {
  id: 'file',
  ownerUserId: mentor.userId,
  courseUnitId: context.courseUnitId,
  status: 'READY',
};
const content: MaterialContent = {
  title: 'Course Unit main document',
  description: null,
  sortOrder: 0,
  availableAt: null,
  sessionId: null,
  file,
};
function draft(): MaterialSnapshot {
  return createMaterialDraft('material', context.courseUnitId, content, mentor, context, now)
    .material;
}
function pending(): MaterialSnapshot {
  return applyMaterialCommand(
    draft(),
    { action: 'SUBMIT', expectedRevision: 1 },
    mentor,
    context,
    now,
  ).material;
}
function approved(): MaterialSnapshot {
  return applyMaterialCommand(
    pending(),
    { action: 'APPROVE', expectedRevision: 1 },
    manager,
    null,
    now,
  ).material;
}
function read(material: MaterialSnapshot, classContext = context, active = true): boolean {
  return canReadMaterial(material, {
    actor: student,
    classContext,
    hasActiveEnrollment: active,
    now,
  });
}

describe('D1/D3/D4/D5: Course Unit material access', () => {
  it('requires approval independently of binary READY', () => {
    expect(read(draft())).toBe(false);
    expect(read(pending())).toBe(false);
    expect(read(approved())).toBe(true);
  });
  it('shares one material across classes with independent release gates', () => {
    const material = approved();
    expect(read(material, { ...context, classId: 'class-B', classUnitId: 'class-unit-B' })).toBe(
      true,
    );
    expect(
      read(material, { ...context, classId: 'class-B', unitStatus: ClassUnitStatus.LOCKED }),
    ).toBe(false);
    expect(read(material, { ...context, courseUnitId: 'different-unit' })).toBe(false);
    expect(read(material, context, false)).toBe(false);
  });
  it('accepts the exact release/availability boundary and blocks times in the future', () => {
    expect(read({ ...approved(), availableAt: now }, { ...context, unlockAt: now })).toBe(true);
    expect(read({ ...approved(), availableAt: future })).toBe(false);
    expect(read(approved(), { ...context, unlockAt: future })).toBe(false);
    expect(read({ ...approved(), publishedAt: future })).toBe(false);
    expect(
      read(approved(), { ...context, unitStatus: ClassUnitStatus.LOCKED, unlockAt: now }),
    ).toBe(false);
  });
  it.each([
    ['unpublished', { publishedAt: null }],
    ['deleted', { deletedAt: now }],
    ['stale review', { revision: 2 }],
    ['rejected', { reviewStatus: MaterialReviewStatus.REJECTED }],
    ['unverified file', { file: { ...file, status: 'PROCESSING' as const } }],
    ['wrong file scope', { file: { ...file, courseUnitId: 'another-unit' } }],
    ['invalid available time', { availableAt: new Date('invalid') }],
  ] satisfies readonly (readonly [string, Partial<MaterialSnapshot>])[])(
    'hides %s content',
    (_name, patch) => {
      expect(read({ ...approved(), ...patch })).toBe(false);
    },
  );
  it('does not revoke the main document when its optional Session is cancelled', () => {
    expect(
      read(
        { ...approved(), sessionId: 'session' },
        {
          ...context,
          sessionId: 'session',
          sessionStatus: SessionStatus.CANCELLED,
        },
      ),
    ).toBe(true);
  });
  it('allows ACTIVE students after class completion and denies cancelled classes', () => {
    expect(
      read(approved(), {
        ...context,
        classStatus: ClassStatus.COMPLETED,
        unitStatus: ClassUnitStatus.COMPLETED,
      }),
    ).toBe(true);
    expect(read(approved(), { ...context, classStatus: ClassStatus.CANCELLED })).toBe(false);
  });
  it('fails closed for inactive actors, wrong roles and an invalid server clock', () => {
    for (const actor of [{ ...student, active: false }, manager, mentor]) {
      expect(
        canReadMaterial(approved(), {
          actor,
          classContext: context,
          hasActiveEnrollment: true,
          now,
        }),
      ).toBe(false);
    }
    expect(
      canReadMaterial(approved(), {
        actor: student,
        classContext: context,
        hasActiveEnrollment: true,
        now: new Date('invalid'),
      }),
    ).toBe(false);
  });
});

describe('D2: Manager approval and Mentor submission', () => {
  it('preserves Course Unit ownership through submit/approve and produces audit events', () => {
    const submitted = applyMaterialCommand(
      draft(),
      { action: 'SUBMIT', expectedRevision: 1 },
      mentor,
      context,
      now,
    );
    expect(submitted.material).toMatchObject({
      courseUnitId: context.courseUnitId,
      createdInClassId: context.classId,
      reviewStatus: 'PENDING_REVIEW',
      publishedAt: null,
    });
    const result = applyMaterialCommand(
      submitted.material,
      { action: 'APPROVE', expectedRevision: 1 },
      manager,
      null,
      now,
    );
    expect(result.material).toMatchObject({
      reviewStatus: 'APPROVED',
      approvedRevision: 1,
      publishedAt: now,
      firstApprovedAt: now,
    });
    expect(result.audit).toMatchObject({ actorId: manager.userId, action: 'APPROVE', revision: 1 });
    expect(submitted.material.publishedAt).toBeNull();
  });
  it.each(['APPROVE', 'PUBLISH', 'UNPUBLISH'] as const)('prevents Mentor self-%s', (action) => {
    expect(() =>
      applyMaterialCommand(pending(), { action, expectedRevision: 1 }, mentor, context, now),
    ).toThrow('MATERIAL_ACCESS_DENIED');
  });
  it('does not grant material manager authority to ADMIN or an inactive Manager', () => {
    for (const actor of [
      { ...manager, role: UserRole.ADMIN },
      { ...manager, active: false },
    ]) {
      expect(() =>
        applyMaterialCommand(
          pending(),
          { action: 'APPROVE', expectedRevision: 1 },
          actor,
          null,
          now,
        ),
      ).toThrow('MATERIAL_ACCESS_DENIED');
    }
  });
  it('requires Mentor submission before Manager approval, and blocks file-not-ready approval', () => {
    expect(() =>
      applyMaterialCommand(draft(), { action: 'APPROVE', expectedRevision: 1 }, manager, null, now),
    ).toThrow('MATERIAL_REVIEW_CONFLICT');
    expect(() =>
      applyMaterialCommand(
        { ...pending(), file: { ...file, status: 'FAILED' } },
        { action: 'APPROVE', expectedRevision: 1 },
        manager,
        null,
        now,
      ),
    ).toThrow('FILE_NOT_READY');
  });
  it('lets Managers directly create and explicitly approve a draft', () => {
    const direct = createMaterialDraft(
      'direct',
      context.courseUnitId,
      { ...content, file: { ...file, ownerUserId: manager.userId } },
      manager,
      null,
      now,
    ).material;
    expect(direct.createdInClassId).toBeNull();
    expect(
      applyMaterialCommand(direct, { action: 'APPROVE', expectedRevision: 1 }, manager, null, now)
        .material.publishedAt,
    ).toEqual(now);
  });
  it('requires a rejection reason, and permits edits and resubmission of rejected own drafts', () => {
    expect(() =>
      applyMaterialCommand(
        pending(),
        { action: 'REJECT', expectedRevision: 1, reason: ' ' },
        manager,
        null,
        now,
      ),
    ).toThrow('MATERIAL_CONTENT_INVALID');
    const rejected = applyMaterialCommand(
      pending(),
      { action: 'REJECT', expectedRevision: 1, reason: 'Wrong content' },
      manager,
      null,
      now,
    ).material;
    expect(read(rejected)).toBe(false);
    const changed = applyMaterialCommand(
      rejected,
      { action: 'EDIT', expectedRevision: 1, changes: { title: 'Corrected' } },
      mentor,
      context,
      now,
    ).material;
    expect(changed).toMatchObject({ reviewStatus: 'DRAFT', revision: 2, rejectionReason: null });
    expect(
      applyMaterialCommand(changed, { action: 'SUBMIT', expectedRevision: 2 }, mentor, context, now)
        .material.reviewStatus,
    ).toBe('PENDING_REVIEW');
  });
  it('blocks draft edits while pending review, after approval, or after reassignment', () => {
    const edit = { action: 'EDIT', expectedRevision: 1, changes: { title: 'Changed' } } as const;
    expect(() => applyMaterialCommand(pending(), edit, mentor, context, now)).toThrow(
      'MATERIAL_ACCESS_DENIED',
    );
    expect(() => applyMaterialCommand(approved(), edit, mentor, context, now)).toThrow(
      'MATERIAL_ACCESS_DENIED',
    );
    expect(canManageOwnDraft(draft(), mentor, { ...context, mentorId: 'replacement' })).toBe(false);
    expect(() =>
      applyMaterialCommand(draft(), edit, mentor, { ...context, mentorId: 'replacement' }, now),
    ).toThrow('MATERIAL_ACCESS_DENIED');
    expect(() =>
      applyMaterialCommand(draft(), edit, mentor, { ...context, classId: 'other-class' }, now),
    ).toThrow('MATERIAL_ACCESS_DENIED');
  });
  it('invalidates publication/approval after Manager changes content and prevents stale approval', () => {
    const changed = applyMaterialCommand(
      approved(),
      { action: 'EDIT', expectedRevision: 1, changes: { title: 'New shared version' } },
      manager,
      null,
      now,
    ).material;
    expect(changed).toMatchObject({
      revision: 2,
      reviewStatus: 'DRAFT',
      approvedRevision: null,
      publishedAt: null,
      firstApprovedAt: now,
    });
    expect(read(changed)).toBe(false);
    expect(() =>
      applyMaterialCommand(changed, { action: 'APPROVE', expectedRevision: 1 }, manager, null, now),
    ).toThrow('MATERIAL_REVIEW_CONFLICT');
    expect(canManageOwnDraft(changed, mentor, context)).toBe(false);
    expect(() =>
      applyMaterialCommand(
        changed,
        { action: 'SUBMIT', expectedRevision: 2 },
        mentor,
        context,
        now,
      ),
    ).toThrow('MATERIAL_ACCESS_DENIED');
    const submitted = applyMaterialCommand(
      changed,
      { action: 'SUBMIT', expectedRevision: 2 },
      manager,
      null,
      now,
    ).material;
    expect(
      read(
        applyMaterialCommand(
          submitted,
          { action: 'APPROVE', expectedRevision: 2 },
          manager,
          null,
          now,
        ).material,
      ),
    ).toBe(true);
  });
  it('makes duplicate submit/review idempotent without resetting publication or audit', () => {
    expect(
      applyMaterialCommand(
        pending(),
        { action: 'SUBMIT', expectedRevision: 1 },
        mentor,
        context,
        future,
      ).audit,
    ).toBeNull();
    const repeated = applyMaterialCommand(
      approved(),
      { action: 'APPROVE', expectedRevision: 1 },
      manager,
      null,
      future,
    );
    expect(repeated.audit).toBeNull();
    expect(repeated.material.publishedAt).toEqual(now);
    expect(() =>
      applyMaterialCommand(
        approved(),
        { action: 'REJECT', expectedRevision: 1, reason: 'Late competing review' },
        manager,
        null,
        now,
      ),
    ).toThrow('MATERIAL_REVIEW_CONFLICT');
  });
  it('unpublishes and republishes the same approved revision, but cannot republish deleted content', () => {
    const hidden = applyMaterialCommand(
      approved(),
      { action: 'UNPUBLISH', expectedRevision: 1 },
      manager,
      null,
      now,
    ).material;
    expect(read(hidden)).toBe(false);
    expect(
      read(
        applyMaterialCommand(hidden, { action: 'PUBLISH', expectedRevision: 1 }, manager, null, now)
          .material,
      ),
    ).toBe(true);
    const deleted = applyMaterialCommand(
      hidden,
      { action: 'DELETE', expectedRevision: 1 },
      manager,
      null,
      now,
    ).material;
    expect(() =>
      applyMaterialCommand(deleted, { action: 'PUBLISH', expectedRevision: 1 }, manager, null, now),
    ).toThrow('MATERIAL_NOT_FOUND');
    expect(
      applyMaterialCommand(
        deleted,
        { action: 'DELETE', expectedRevision: 1 },
        manager,
        null,
        future,
      ).audit,
    ).toBeNull();
  });
  it('permits preview of published shared content and own unapproved draft only', () => {
    expect(canPreviewMaterial(draft(), manager, null)).toBe(true);
    expect(canPreviewMaterial(pending(), mentor, context)).toBe(true);
    expect(canPreviewMaterial({ ...draft(), createdBy: 'another-mentor' }, mentor, context)).toBe(
      false,
    );
    expect(canPreviewMaterial(approved(), mentor, context)).toBe(true);
    expect(canPreviewMaterial(approved(), mentor, { ...context, mentorId: 'another-mentor' })).toBe(
      false,
    );
    expect(canPreviewMaterial(draft(), student, context)).toBe(false);
  });
  it('rejects wrong file ownership, wrong Course Unit and an unrelated Session', () => {
    expect(() =>
      createMaterialDraft(
        'id',
        context.courseUnitId,
        { ...content, file: { ...file, ownerUserId: 'another-uploader' } },
        mentor,
        context,
        now,
      ),
    ).toThrow('FILE_OWNER_MISMATCH');
    expect(() => createMaterialDraft('id', 'other-unit', content, manager, null, now)).toThrow(
      'MATERIAL_SCOPE_MISMATCH',
    );
    expect(() =>
      createMaterialDraft(
        'id',
        context.courseUnitId,
        { ...content, sessionId: 'foreign-session' },
        manager,
        context,
        now,
      ),
    ).toThrow('MATERIAL_SCOPE_MISMATCH');
  });

  it('prevents changing Course Unit through edits and handles repeated own-draft deletion', () => {
    const changes = { title: 'Title', courseUnitId: 'another-unit' };
    expect(() =>
      applyMaterialCommand(
        draft(),
        { action: 'EDIT', expectedRevision: 1, changes },
        mentor,
        context,
        now,
      ),
    ).toThrow('MATERIAL_CONTENT_INVALID');
    const deleted = applyMaterialCommand(
      draft(),
      { action: 'DELETE', expectedRevision: 1 },
      mentor,
      context,
      now,
    ).material;
    expect(
      applyMaterialCommand(
        deleted,
        { action: 'DELETE', expectedRevision: 1 },
        mentor,
        context,
        future,
      ).audit,
    ).toBeNull();
  });

  it('prevents stale preview and Mentor edits of a Manager redraft after prior approval', () => {
    const changed = applyMaterialCommand(
      approved(),
      { action: 'EDIT', expectedRevision: 1, changes: { title: 'Manager revision' } },
      manager,
      null,
      now,
    ).material;
    expect(canPreviewMaterial(changed, mentor, context)).toBe(false);
    expect(canPreviewMaterial(changed, manager, null)).toBe(true);
    expect(
      applyMaterialCommand(changed, { action: 'APPROVE', expectedRevision: 2 }, manager, null, now)
        .material.reviewStatus,
    ).toBe('APPROVED');
    expect(
      canPreviewMaterial({ ...approved(), file: { ...file, status: 'DELETED' } }, manager, null),
    ).toBe(false);
  });

  it('rejects link-only extensions in the file-only MVP contract', () => {
    const linkedContent = { ...content, externalUrl: 'https://example.test/file.pdf' };
    expect(() =>
      createMaterialDraft('id', context.courseUnitId, linkedContent, manager, null, now),
    ).toThrow('MATERIAL_CONTENT_INVALID');
  });
});

describe('D6: closed MVP file declaration contract', () => {
  it.each([
    'pdf',
    'png',
    'jpg',
    'jpeg',
    'docx',
    'pptx',
    'xlsx',
    'mp3',
    'mp4',
    'txt',
    'md',
    'csv',
    'json',
    'js',
    'ts',
    'py',
    'java',
    'c',
    'cpp',
    'h',
    'css',
    'sql',
  ])('accepts supported .%s declarations', (extension) => {
    const mime: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
    };
    expect(
      validateMaterialFileDeclaration(`material.${extension}`, mime[extension] ?? 'text/plain', 1)
        .maxSizeBytes,
    ).toBeGreaterThan(0);
  });
  it.each(['exe', 'html', 'svg', 'zip', 'rar', 'sh', 'bat', 'm3u8'])(
    'rejects .%s files in MVP',
    (extension) => {
      expect(() =>
        validateMaterialFileDeclaration(`file.${extension}`, 'application/octet-stream', 1),
      ).toThrow('MATERIAL_CONTENT_INVALID');
    },
  );
  it('enforces ordinary/video size boundaries and safe declarations without claiming binary verification', () => {
    expect(validateMaterialFileDeclaration('image.PNG', 'image/png', 25 * 1024 * 1024).kind).toBe(
      'IMAGE',
    );
    expect(validateMaterialFileDeclaration('movie.mp4', 'video/mp4', 200 * 1024 * 1024).kind).toBe(
      'VIDEO',
    );
    for (const size of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1, 25 * 1024 * 1024 + 1]) {
      expect(() => validateMaterialFileDeclaration('file.pdf', 'application/pdf', size)).toThrow(
        'MATERIAL_CONTENT_INVALID',
      );
    }
    expect(() =>
      validateMaterialFileDeclaration('movie.mp4', 'video/mp4', 200 * 1024 * 1024 + 1),
    ).toThrow();
    for (const filename of ['../file.pdf', 'file\r\n.pdf', 'C:\\file.pdf', ' file.pdf', 'file']) {
      expect(() => validateMaterialFileDeclaration(filename, 'application/pdf', 1)).toThrow();
    }
    expect(() => validateMaterialFileDeclaration('file.pdf', 'text/html', 1)).toThrow();
  });
});
