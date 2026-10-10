import type { ClassContentContext } from '../../classes/domain/class-content-context.js';
import { UserRole } from '../../users/user-role.enum.js';
import {
  canManageOwnDraft,
  hasCurrentApproval,
  isAssignedMentor,
  isMaterialManager,
} from './material-access.js';
import {
  type MaterialActor,
  type MaterialCommand,
  type MaterialContent,
  MaterialReviewStatus,
  type MaterialSnapshot,
  type MaterialTransition,
} from './material-contract.js';
import { MaterialPolicyError } from './material-policy.error.js';

function deny(): never {
  throw new MaterialPolicyError('MATERIAL_ACCESS_DENIED');
}

function conflict(): never {
  throw new MaterialPolicyError('MATERIAL_REVIEW_CONFLICT');
}

function assertContent(
  content: MaterialContent,
  courseUnitId: string,
  actor: MaterialActor,
  context: ClassContentContext | null,
): void {
  if (
    'externalUrl' in content ||
    'external_url' in content ||
    content.title.trim().length === 0 ||
    content.title.length > 250 ||
    (content.description !== null && content.description.length > 5000) ||
    !Number.isSafeInteger(content.sortOrder) ||
    content.sortOrder < 0 ||
    (content.availableAt !== null && !Number.isFinite(content.availableAt.getTime()))
  ) {
    throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
  }
  if (courseUnitId.length === 0 || content.file.courseUnitId !== courseUnitId) {
    throw new MaterialPolicyError('MATERIAL_SCOPE_MISMATCH');
  }
  if (content.file.status !== 'READY') throw new MaterialPolicyError('FILE_NOT_READY');
  if (!isMaterialManager(actor) && content.file.ownerUserId !== actor.userId) {
    throw new MaterialPolicyError('FILE_OWNER_MISMATCH');
  }
  if (
    content.sessionId !== null &&
    (context === null ||
      context.sessionId !== content.sessionId ||
      context.courseUnitId !== courseUnitId)
  ) {
    throw new MaterialPolicyError('MATERIAL_SCOPE_MISMATCH');
  }
}

function transition(
  before: MaterialSnapshot | null,
  material: MaterialSnapshot,
  actor: MaterialActor,
  action: MaterialCommand['action'] | 'CREATE',
  now: Date,
): MaterialTransition {
  return {
    material,
    audit:
      material === before
        ? null
        : {
            materialId: material.id,
            actorId: actor.userId,
            action,
            revision: material.revision,
            occurredAt: now,
          },
  };
}

export function createMaterialDraft(
  id: string,
  courseUnitId: string,
  content: MaterialContent,
  actor: MaterialActor,
  context: ClassContentContext | null,
  now: Date,
): MaterialTransition {
  if (
    !isMaterialManager(actor) &&
    (context === null || !isAssignedMentor(actor, context) || context.courseUnitId !== courseUnitId)
  )
    deny();
  if (!Number.isFinite(now.getTime()) || id.length === 0) {
    throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
  }
  assertContent(content, courseUnitId, actor, context);
  const material: MaterialSnapshot = {
    ...content,
    id,
    courseUnitId,
    createdBy: actor.userId,
    createdInClassId: actor.role === UserRole.MENTOR ? (context?.classId ?? null) : null,
    revision: 1,
    reviewStatus: MaterialReviewStatus.DRAFT,
    approvedRevision: null,
    reviewedBy: null,
    reviewedAt: null,
    firstApprovedAt: null,
    rejectionReason: null,
    publishedAt: null,
    deletedAt: null,
  };
  return transition(null, material, actor, 'CREATE', now);
}

/** Produces new state + audit only. Persistence must compare/lock expectedRevision atomically. */
export function applyMaterialCommand(
  material: MaterialSnapshot,
  command: MaterialCommand,
  actor: MaterialActor,
  context: ClassContentContext | null,
  now: Date,
): MaterialTransition {
  const manager = isMaterialManager(actor);
  const ownDraft = canManageOwnDraft(material, actor, context);
  const ownSubmission =
    context !== null &&
    isAssignedMentor(actor, context) &&
    material.createdBy === actor.userId &&
    material.createdInClassId === context.classId &&
    material.courseUnitId === context.courseUnitId;
  const editableSubmission = ownSubmission && material.firstApprovedAt === null;
  if (!manager && !editableSubmission) deny();
  if (material.deletedAt !== null && command.action !== 'DELETE') {
    throw new MaterialPolicyError('MATERIAL_NOT_FOUND');
  }
  if (
    !Number.isSafeInteger(material.revision) ||
    material.revision < 1 ||
    command.expectedRevision !== material.revision ||
    !Number.isFinite(now.getTime())
  )
    conflict();
  let updated: MaterialSnapshot;

  switch (command.action) {
    case 'EDIT': {
      if (!manager && !ownDraft) deny();
      if (!Number.isSafeInteger(material.revision + 1)) conflict();
      const fields = Object.keys(command.changes);
      if (
        fields.length === 0 ||
        fields.some(
          (field) =>
            !['title', 'description', 'sortOrder', 'availableAt', 'sessionId', 'file'].includes(
              field,
            ),
        ) ||
        Object.values(command.changes).some((value) => value === undefined)
      ) {
        throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
      }
      const content = { ...material, ...command.changes };
      assertContent(content, material.courseUnitId, actor, context);
      updated = {
        ...content,
        revision: material.revision + 1,
        reviewStatus: MaterialReviewStatus.DRAFT,
        approvedRevision: null,
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        publishedAt: null,
      };
      break;
    }
    case 'SUBMIT':
      if (!manager && !ownSubmission) deny();
      if (material.reviewStatus === MaterialReviewStatus.PENDING_REVIEW) {
        return transition(material, material, actor, command.action, now);
      }
      if (material.reviewStatus !== MaterialReviewStatus.DRAFT) conflict();
      assertContent(material, material.courseUnitId, actor, context);
      updated = { ...material, reviewStatus: MaterialReviewStatus.PENDING_REVIEW };
      break;
    case 'APPROVE':
    case 'REJECT': {
      if (!manager) deny();
      const target =
        command.action === 'APPROVE'
          ? MaterialReviewStatus.APPROVED
          : MaterialReviewStatus.REJECTED;
      if (material.reviewStatus === target) {
        if (command.action === 'APPROVE' && !hasCurrentApproval(material)) conflict();
        if (command.action === 'REJECT' && material.rejectionReason !== command.reason.trim())
          conflict();
        return transition(material, material, actor, command.action, now);
      }
      if (
        material.reviewStatus !== MaterialReviewStatus.PENDING_REVIEW &&
        !(
          command.action === 'APPROVE' &&
          material.reviewStatus === MaterialReviewStatus.DRAFT &&
          (material.createdInClassId === null || material.firstApprovedAt !== null)
        )
      )
        conflict();
      assertContent(material, material.courseUnitId, actor, context);
      if (
        command.action === 'REJECT' &&
        (command.reason.trim().length === 0 || command.reason.length > 2000)
      ) {
        throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
      }
      updated = {
        ...material,
        reviewStatus: target,
        reviewedBy: actor.userId,
        reviewedAt: now,
        firstApprovedAt:
          command.action === 'APPROVE'
            ? (material.firstApprovedAt ?? now)
            : material.firstApprovedAt,
        approvedRevision: command.action === 'APPROVE' ? material.revision : null,
        publishedAt: command.action === 'APPROVE' ? now : null,
        rejectionReason: command.action === 'REJECT' ? command.reason.trim() : null,
      };
      break;
    }
    case 'PUBLISH':
      if (!manager) deny();
      if (!hasCurrentApproval(material)) conflict();
      assertContent(material, material.courseUnitId, actor, context);
      updated = material.publishedAt === null ? { ...material, publishedAt: now } : material;
      break;
    case 'UNPUBLISH':
      if (!manager) deny();
      updated = material.publishedAt === null ? material : { ...material, publishedAt: null };
      break;
    case 'DELETE':
      if (
        !manager &&
        !ownDraft &&
        !(
          ownSubmission &&
          material.deletedAt !== null &&
          (material.reviewStatus === MaterialReviewStatus.DRAFT ||
            material.reviewStatus === MaterialReviewStatus.REJECTED)
        )
      )
        deny();
      updated =
        material.deletedAt === null ? { ...material, deletedAt: now, publishedAt: null } : material;
      break;
  }
  return transition(material, updated, actor, command.action, now);
}
