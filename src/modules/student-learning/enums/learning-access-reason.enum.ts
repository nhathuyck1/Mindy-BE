/** Why a My Classes row has its access mode; a UI hint, not an access token. */
export enum LearningAccessReason {
  ACTIVE_ENROLLMENT = 'ACTIVE_ENROLLMENT',
  PENDING_CASH = 'PENDING_CASH',
  PENDING_PAYOS = 'PENDING_PAYOS',
  HOLD_EXPIRED = 'HOLD_EXPIRED',
  ENROLLMENT_CANCELLED = 'ENROLLMENT_CANCELLED',
  ENROLLMENT_COMPLETED = 'ENROLLMENT_COMPLETED',
  CLASS_CANCELLED = 'CLASS_CANCELLED',
  /** The enrollment → order detail → own order chain is inconsistent; fails closed. */
  STATE_MISMATCH = 'STATE_MISMATCH',
}
