import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MaterialContentType } from '../entities/material.entity.js';
import { hasReadyMaterialContent } from './material-content.js';
import type { MaterialContent } from './material-contract.js';

describe('shared typed material content predicate', () => {
  const unit = randomUUID();
  const article: MaterialContent = {
    title: 'Lesson',
    description: null,
    sortOrder: 0,
    availableAt: null,
    sessionId: null,
    file: null,
    contentType: MaterialContentType.ARTICLE,
    contentHtml: '<p>Lesson</p>',
    contentSchemaVersion: 1,
    inlineImages: [],
    attachments: [],
  };
  it('allows ARTICLE-only without a primary file', () => {
    expect(hasReadyMaterialContent(article, unit)).toBe(true);
  });
  it('requires verified inline IDs and every reference READY in the owning Unit', () => {
    const id = randomUUID();
    expect(
      hasReadyMaterialContent({ ...article, contentHtml: `<img data-file-id="${id}" />` }, unit),
    ).toBe(false);
    expect(
      hasReadyMaterialContent(
        {
          ...article,
          attachments: [{ id, ownerUserId: randomUUID(), courseUnitId: unit, status: 'FAILED' }],
        },
        unit,
      ),
    ).toBe(false);
    expect(
      hasReadyMaterialContent(
        {
          ...article,
          attachments: [
            { id, ownerUserId: randomUUID(), courseUnitId: randomUUID(), status: 'READY' },
          ],
        },
        unit,
      ),
    ).toBe(false);
  });
  it('rejects noncanonical HTML and missing FILE/VIDEO primary', () => {
    expect(
      hasReadyMaterialContent({ ...article, contentHtml: '<p onclick="bad()">Lesson</p>' }, unit),
    ).toBe(false);
    expect(
      hasReadyMaterialContent(
        {
          ...article,
          contentType: MaterialContentType.VIDEO,
          contentHtml: null,
          contentSchemaVersion: null,
        },
        unit,
      ),
    ).toBe(false);
  });
});
