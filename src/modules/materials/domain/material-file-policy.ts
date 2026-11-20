import {
  type FileRule,
  UploadPolicyError,
  validateFileDeclaration,
} from '../../files/files.contracts.js';
import { MaterialPolicyError } from './material-policy.error.js';

/** Compatibility facade; the allowlist has one owner in Files. */
export function validateMaterialFileDeclaration(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): FileRule {
  try {
    return validateFileDeclaration(filename, mimeType, sizeBytes);
  } catch (error: unknown) {
    if (error instanceof UploadPolicyError) throw new MaterialPolicyError(error.code);
    throw error;
  }
}
