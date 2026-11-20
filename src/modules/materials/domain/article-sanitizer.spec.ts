import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ARTICLE_MAX_BYTES, sanitizeArticle } from './article-sanitizer.js';

describe('canonical ARTICLE sanitizer', () => {
  it('supports text-only, image-only, CKEditor tables and derives unique refs', () => {
    const id = randomUUID();
    expect(
      sanitizeArticle('<h2>Kiến thức</h2><p><strong>Ví dụ</strong></p>').inlineFileIds,
    ).toEqual([]);
    const result = sanitizeArticle(
      `<figure class="image"><img data-file-id="${id}" src="https://evil.test/signed" onerror="alert(1)"><img data-file-id="${id.toUpperCase()}"></figure>`,
    );
    expect(result.inlineFileIds).toEqual([id]);
    expect(result.contentHtml).not.toMatch(/src|onerror|class=/);
    expect(sanitizeArticle(result.contentHtml)).toEqual(result);
    expect(
      sanitizeArticle('<table><tbody><tr><td colspan="2">Lesson</td></tr></tbody></table>')
        .contentHtml,
    ).toContain('<td colspan="2">');
  });
  it.each([
    'javascript:alert(1)',
    'java&#x73;cript:alert(1)',
    'data:text/html;base64,YQ==',
    '//evil.test',
    '/relative',
    'file:///tmp/secret',
    'vbscript:alert(1)',
  ])('strips unsafe href %s', (href) => {
    expect(
      sanitizeArticle(`<p style="color:red" onclick="alert(1)"><a href="${href}">Hello</a></p>`)
        .contentHtml,
    ).toBe('<p><a>Hello</a></p>');
  });
  it('keeps only absolute http/https/mailto links without event/style/target attributes', () => {
    const output = sanitizeArticle(
      '<a href="https://example.test" target="_blank">Web</a><a href="mailto:a@example.test">Mail</a>',
    ).contentHtml;
    expect(output).toContain('href="https://example.test"');
    expect(output).toContain('href="mailto:a@example.test"');
    expect(output).not.toContain('target');
  });
  it.each([
    '<script>alert(1)</script>',
    '<iframe>hidden</iframe>',
    '<p>&nbsp;\u200b</p>',
    '<img src="data:image/png;base64,YQ==">',
    '<svg><script>alert(1)</script></svg>',
    '<img data-file-id="invalid">',
  ])('rejects empty/invalid article %s', (input) => {
    expect(() => sanitizeArticle(input)).toThrow('MATERIAL_CONTENT_INVALID');
  });
  it('blocks XSS in malformed/encoded markup', () => {
    const result = sanitizeArticle(
      '<p>Visible</p><math><mtext><img src=x onerror=alert(1)></mtext></math><object data="javascript:alert(1)">bad</object><a href="java&#10;script:alert(1)">safe text</a>',
    );
    expect(result.contentHtml).toBe('<p>Visible</p><a>safe text</a>');
  });
  it('checks input/output UTF-8 bytes, depth, nodes and image node count', () => {
    expect(() => sanitizeArticle('đ'.repeat(ARTICLE_MAX_BYTES / 2 + 1))).toThrow(
      'MATERIAL_CONTENT_TOO_LARGE',
    );
    expect(() => sanitizeArticle('&'.repeat(11000))).toThrow('MATERIAL_CONTENT_TOO_LARGE');
    expect(() =>
      sanitizeArticle(`${'<blockquote>'.repeat(33)}text${'</blockquote>'.repeat(33)}`),
    ).toThrow('MATERIAL_CONTENT_INVALID');
    expect(() => sanitizeArticle(`${'<br>'.repeat(5001)}text`)).toThrow('MATERIAL_CONTENT_INVALID');
    expect(() => sanitizeArticle(`<img data-file-id="${randomUUID()}">`.repeat(51))).toThrow(
      'MATERIAL_CONTENT_INVALID',
    );
    expect(sanitizeArticle('x'.repeat(ARTICLE_MAX_BYTES)).contentHtml.length).toBe(
      ARTICLE_MAX_BYTES,
    );
  });
});
