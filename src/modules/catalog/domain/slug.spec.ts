import { describe, expect, it } from 'vitest';

import { slugify } from './slug.js';

describe('slugify', () => {
  it('folds Vietnamese diacritics and separators into a lower-case slug', () => {
    expect(slugify('  Lập trình Web & Đồ họa  ')).toBe('lap-trinh-web-do-hoa');
  });

  it('returns an empty slug when the name has no usable characters', () => {
    expect(slugify('!!! ???')).toBe('');
  });
});
