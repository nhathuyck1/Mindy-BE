import { describe, expect, it } from 'vitest';
import type { MaterialFileReference } from './material-contract.js';
import { findMaterialFileRole, materialFileDisposition } from './material-file-access.js';

function file(id: string): MaterialFileReference {
  return { id, ownerUserId: 'owner', courseUnitId: 'unit', status: 'READY' };
}

describe('material file access', () => {
  const content = {
    file: file('primary'),
    inlineImages: [file('image')],
    attachments: [file('attachment')],
  };

  it('resolves each server-owned reference to its role', () => {
    expect(findMaterialFileRole(content, 'primary')).toBe('PRIMARY');
    expect(findMaterialFileRole(content, 'image')).toBe('INLINE_IMAGE');
    expect(findMaterialFileRole(content, 'attachment')).toBe('ATTACHMENT');
  });

  it('grants nothing for a fileId the material does not reference', () => {
    expect(findMaterialFileRole(content, 'foreign')).toBeNull();
    expect(findMaterialFileRole({ file: null }, 'primary')).toBeNull();
  });

  it('serves attachments as downloads and primary/inline assets inline', () => {
    expect(materialFileDisposition('ATTACHMENT')).toBe('attachment');
    expect(materialFileDisposition('PRIMARY')).toBe('inline');
    expect(materialFileDisposition('INLINE_IMAGE')).toBe('inline');
  });
});
