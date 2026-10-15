import type { ContentDisposition } from '../../files/files.contracts.js';
import type { MaterialContent } from './material-contract.js';

export type MaterialFileRole = 'PRIMARY' | 'INLINE_IMAGE' | 'ATTACHMENT';

export const MATERIAL_FILE_ROLES: readonly MaterialFileRole[] = [
  'PRIMARY',
  'INLINE_IMAGE',
  'ATTACHMENT',
];

type MaterialFiles = Pick<MaterialContent, 'file' | 'inlineImages' | 'attachments'>;

/** Resolves a fileId only through server-owned Material references; unknown IDs grant nothing. */
export function findMaterialFileRole(
  content: MaterialFiles,
  fileId: string,
): MaterialFileRole | null {
  if (content.file?.id === fileId) return 'PRIMARY';
  if ((content.inlineImages ?? []).some((file) => file.id === fileId)) return 'INLINE_IMAGE';
  if ((content.attachments ?? []).some((file) => file.id === fileId)) return 'ATTACHMENT';
  return null;
}

/** Primary/inline assets render in the viewer; attachments are offered as downloads. */
export function materialFileDisposition(role: MaterialFileRole): ContentDisposition {
  return role === 'ATTACHMENT' ? 'attachment' : 'inline';
}
