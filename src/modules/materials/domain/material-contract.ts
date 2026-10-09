import type { ClassContentContext } from '../../classes/domain/class-content-context.js';
import type { UserRole } from '../../users/user-role.enum.js';

export enum MaterialReviewStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export interface MaterialActor {
  readonly userId: string;
  readonly role: UserRole;
  readonly active: boolean;
}

/** Server-resolved file reference, never client declarations or storage secrets. */
export interface MaterialFileReference {
  readonly id: string;
  readonly ownerUserId: string;
  readonly courseUnitId: string;
  readonly status: 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';
}

export interface MaterialContent {
  readonly title: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly availableAt: Date | null;
  readonly sessionId: string | null;
  readonly file: MaterialFileReference;
}

/** Course Unit is the sole owner. createdInClassId records mentor submission provenance. */
export interface MaterialSnapshot extends MaterialContent {
  readonly id: string;
  readonly courseUnitId: string;
  readonly createdBy: string;
  readonly createdInClassId: string | null;
  readonly revision: number;
  readonly reviewStatus: MaterialReviewStatus;
  readonly approvedRevision: number | null;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly firstApprovedAt: Date | null;
  readonly rejectionReason: string | null;
  readonly publishedAt: Date | null;
  readonly deletedAt: Date | null;
}

export interface MaterialReadContext {
  readonly actor: MaterialActor;
  readonly classContext: ClassContentContext;
  readonly hasActiveEnrollment: boolean;
  readonly now: Date;
}

export type MaterialCommand =
  | {
      readonly action: 'EDIT';
      readonly expectedRevision: number;
      readonly changes: Partial<MaterialContent>;
    }
  | { readonly action: 'REJECT'; readonly expectedRevision: number; readonly reason: string }
  | {
      readonly action: 'SUBMIT' | 'APPROVE' | 'PUBLISH' | 'UNPUBLISH' | 'DELETE';
      readonly expectedRevision: number;
    };

export interface MaterialAuditEvent {
  readonly materialId: string;
  readonly actorId: string;
  readonly action: MaterialCommand['action'] | 'CREATE';
  readonly revision: number;
  readonly occurredAt: Date;
}

export interface MaterialTransition {
  readonly material: MaterialSnapshot;
  readonly audit: MaterialAuditEvent | null;
}
