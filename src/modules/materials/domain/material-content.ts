import { MaterialContentType } from '../entities/material.entity.js';
import { sanitizeArticle } from './article-sanitizer.js';
import type { MaterialContent, MaterialFileReference } from './material-contract.js';
import { MaterialPolicyError } from './material-policy.error.js';

export function materialReferences(content: MaterialContent): readonly MaterialFileReference[] {
  return [
    ...(content.file ? [content.file] : []),
    ...(content.inlineImages ?? []),
    ...(content.attachments ?? []),
  ];
}

export function hasReadyMaterialContent(content: MaterialContent, courseUnitId: string): boolean {
  try {
    assertTypedMaterialContent(content);
  } catch {
    return false;
  }
  const refs = materialReferences(content);
  if (refs.some((file) => file.status !== 'READY' || file.courseUnitId !== courseUnitId))
    return false;
  if (content.contentType === MaterialContentType.ARTICLE)
    return (
      content.file === null &&
      typeof content.contentHtml === 'string' &&
      content.contentHtml.length > 0 &&
      content.contentSchemaVersion === 1
    );
  return content.file !== null;
}

export function assertTypedMaterialContent(content: MaterialContent): void {
  if (content.contentType === undefined) {
    if (content.file === null) throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
    return;
  }
  if (content.contentType === MaterialContentType.ARTICLE) {
    if (
      content.file !== null ||
      content.contentSchemaVersion !== 1 ||
      typeof content.contentHtml !== 'string'
    )
      throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
    const canonical = sanitizeArticle(content.contentHtml);
    const actual = [...new Set((content.inlineImages ?? []).map((file) => file.id))].sort();
    if (
      canonical.contentHtml !== content.contentHtml ||
      JSON.stringify(actual) !== JSON.stringify(canonical.inlineFileIds)
    )
      throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
    if ((content.inlineImages ?? []).some((file) => !('kind' in file) || file.kind !== 'IMAGE'))
      throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
  } else {
    if (
      content.file === null ||
      content.contentHtml != null ||
      content.contentSchemaVersion != null ||
      (content.inlineImages?.length ?? 0) !== 0
    )
      throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
    if (
      'kind' in content.file &&
      ((content.contentType === MaterialContentType.VIDEO &&
        (content.file.kind !== 'VIDEO' ||
          !('mimeType' in content.file) ||
          content.file.mimeType !== 'video/mp4')) ||
        (content.contentType === MaterialContentType.FILE && content.file.kind === 'VIDEO'))
    )
      throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
  }
  const attachments = content.attachments ?? [];
  if (
    attachments.length > 50 ||
    new Set(attachments.map((file) => file.id)).size !== attachments.length ||
    attachments.some((file) => file.id === content.file?.id)
  )
    throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
}
