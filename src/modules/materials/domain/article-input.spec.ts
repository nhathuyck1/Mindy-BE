import { describe, expect, it } from 'vitest';
import { articleInputHtml } from './article-input.js';
import { sanitizeArticle } from './article-sanitizer.js';

describe('ARTICLE text/HTML input', () => {
  it('escapes literal markup, entities and line endings without creating inline image refs', () => {
    const html = articleInputHtml(undefined, '<img data-file-id="x">\r\nA & B');
    expect(html).toBe('<p>&lt;img data-file-id=&quot;x&quot;&gt;<br>A &amp; B</p>');
    expect(sanitizeArticle(html ?? '').inlineFileIds).toEqual([]);
  });
  it('keeps existing HTML API and rejects mixed input, blank content and escaped output overflow', () => {
    expect(articleInputHtml('<p>Editor</p>', undefined)).toBe('<p>Editor</p>');
    expect(() => articleInputHtml('<p>Editor</p>', 'text')).toThrow();
    expect(() => sanitizeArticle(articleInputHtml(undefined, ' ') ?? '')).toThrow();
    expect(() => sanitizeArticle(articleInputHtml(undefined, '<'.repeat(15000)) ?? '')).toThrow();
    expect(() => articleInputHtml(undefined, 'a'.repeat(49153))).toThrow();
  });
});
