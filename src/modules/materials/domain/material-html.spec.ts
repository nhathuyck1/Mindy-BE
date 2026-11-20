import { describe, expect, it } from 'vitest';
import { sanitizeMaterialHtml } from './material-html.js';

describe('CKEditor canonical article HTML', () => {
  it('preserves lesson formatting while removing scripts, events, CSS and embeds', () => {
    const input =
      '<h2>Mục tiêu</h2><p style="color:red" onclick="alert(1)"><strong>Kiến thức</strong><script>alert(1)</script><iframe src="https://evil.test"></iframe></p><figure class="table"><table><tbody><tr><td colspan="2">Ví dụ</td></tr></tbody></table></figure>';
    const result = sanitizeMaterialHtml(input);
    expect(result.html).toContain('<strong>Kiến thức</strong>');
    expect(result.html).toContain('<td colspan="2">Ví dụ</td>');
    expect(result.html).not.toMatch(/script|iframe|onclick|style=|class=|alert/);
    expect(sanitizeMaterialHtml(result.html)).toEqual(result);
  });
  it('strips unsafe and relative links including encoded protocols', () => {
    for (const href of [
      'javascript:alert(1)',
      '&#106;avascript:alert(1)',
      'data:text/html,boom',
      '//evil.test',
      '/private',
    ]) {
      expect(sanitizeMaterialHtml(`<p><a href="${href}">Link</a></p>`).html).toBe(
        '<p><a>Link</a></p>',
      );
    }
    expect(sanitizeMaterialHtml('<a href="https://example.test">Link</a>').html).toContain(
      'href="https://example.test"',
    );
  });
  it('derives inline IDs and removes every transient image URL', () => {
    const id = '55555555-5555-4555-8555-555555555555';
    const result = sanitizeMaterialHtml(
      `<figure class="image"><img src="data:image/png;base64,aaa" data-file-id="${id}" onerror="alert(1)" alt="Sơ đồ"></figure>`,
    );
    expect(result.inlineFileIds).toEqual([id]);
    expect(result.html).toBe(`<figure><img data-file-id="${id}" alt="Sơ đồ" /></figure>`);
    expect(() => sanitizeMaterialHtml('<img src="https://external.test/image.png">')).toThrow();
  });
  it('rejects empty content and bounded resource abuse', () => {
    for (const html of [
      '',
      '<p>&nbsp;</p>',
      '<script>secret</script>',
      `<p>${'字'.repeat(17000)}</p>`,
      `${'<blockquote>'.repeat(33)}x${'</blockquote>'.repeat(33)}`,
      `${'<br>'.repeat(5001)}text`,
    ])
      expect(() => sanitizeMaterialHtml(html)).toThrow();
    expect(() =>
      sanitizeMaterialHtml('<img data-file-id="55555555-5555-4555-8555-555555555555">'.repeat(51)),
    ).toThrow();
  });
});
