export type MaterialPolicyErrorCode =
  | 'MATERIAL_ACCESS_DENIED'
  | 'MATERIAL_NOT_FOUND'
  | 'MATERIAL_REVIEW_CONFLICT'
  | 'MATERIAL_CONTENT_INVALID'
  | 'MATERIAL_SCOPE_MISMATCH'
  | 'FILE_NOT_READY'
  | 'FILE_OWNER_MISMATCH';

/** Domain errors contain stable codes, no HTTP/storage/database details. */
export class MaterialPolicyError extends Error {
  constructor(readonly code: MaterialPolicyErrorCode) {
    super(code);
    this.name = 'MaterialPolicyError';
  }
}
