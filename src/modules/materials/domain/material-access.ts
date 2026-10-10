import type { ClassContentContext } from '../../classes/domain/class-content-context.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { ClassUnitStatus } from '../../classes/enums/class-unit-status.enum.js';
import { UserRole } from '../../users/user-role.enum.js';
import {
  type MaterialActor,
  type MaterialReadContext,
  MaterialReviewStatus,
  type MaterialSnapshot,
} from './material-contract.js';

export function isAssignedMentor(actor: MaterialActor, context: ClassContentContext): boolean {
  return (
    actor.active &&
    actor.role === UserRole.MENTOR &&
    actor.userId === context.mentorId &&
    context.classStatus !== ClassStatus.CANCELLED
  );
}

export function isMaterialManager(actor: MaterialActor): boolean {
  return actor.active && actor.role === UserRole.MANAGER;
}

export function hasCurrentApproval(material: MaterialSnapshot): boolean {
  return (
    material.reviewStatus === MaterialReviewStatus.APPROVED &&
    Number.isSafeInteger(material.revision) &&
    material.revision > 0 &&
    material.approvedRevision === material.revision &&
    material.reviewedBy !== null &&
    material.reviewedAt !== null &&
    material.firstApprovedAt !== null &&
    Number.isFinite(material.firstApprovedAt.getTime()) &&
    Number.isFinite(material.reviewedAt.getTime())
  );
}

function hasReached(time: Date | null, now: Date): boolean {
  return time === null || (Number.isFinite(time.getTime()) && time.getTime() <= now.getTime());
}

/** D1/D3/D4/D5: delivery gates belong to the accessed class, ownership to Course Unit. */
export function canReadMaterial(material: MaterialSnapshot, context: MaterialReadContext): boolean {
  const { actor, classContext, hasActiveEnrollment, now } = context;
  return (
    actor.active &&
    actor.role === UserRole.STUDENT &&
    Number.isFinite(now.getTime()) &&
    hasActiveEnrollment &&
    classContext.classStatus !== ClassStatus.CANCELLED &&
    material.courseUnitId === classContext.courseUnitId &&
    (classContext.unitStatus === ClassUnitStatus.OPEN ||
      classContext.unitStatus === ClassUnitStatus.COMPLETED) &&
    hasReached(classContext.unlockAt, now) &&
    material.deletedAt === null &&
    hasCurrentApproval(material) &&
    hasReached(material.reviewedAt, now) &&
    material.publishedAt !== null &&
    hasReached(material.publishedAt, now) &&
    hasReached(material.availableAt, now) &&
    material.file.status === 'READY' &&
    material.file.courseUnitId === material.courseUnitId
  );
}

export function canManageOwnDraft(
  material: MaterialSnapshot,
  actor: MaterialActor,
  context: ClassContentContext | null,
): boolean {
  return (
    context !== null &&
    isAssignedMentor(actor, context) &&
    material.courseUnitId === context.courseUnitId &&
    material.createdInClassId === context.classId &&
    material.createdBy === actor.userId &&
    material.deletedAt === null &&
    material.firstApprovedAt === null &&
    (material.reviewStatus === MaterialReviewStatus.DRAFT ||
      material.reviewStatus === MaterialReviewStatus.REJECTED)
  );
}

export function canPreviewMaterial(
  material: MaterialSnapshot,
  actor: MaterialActor,
  context: ClassContentContext | null,
): boolean {
  if (
    material.deletedAt !== null ||
    material.file.status !== 'READY' ||
    material.file.courseUnitId !== material.courseUnitId
  )
    return false;
  if (isMaterialManager(actor)) return true;
  if (
    context === null ||
    !isAssignedMentor(actor, context) ||
    context.courseUnitId !== material.courseUnitId
  )
    return false;
  return (
    (hasCurrentApproval(material) && material.publishedAt !== null) ||
    (material.createdBy === actor.userId &&
      material.createdInClassId === context.classId &&
      material.firstApprovedAt === null)
  );
}
