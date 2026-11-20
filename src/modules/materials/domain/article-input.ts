import { MaterialPolicyError } from './material-policy.error.js';

/** Plain text is escaped before sanitization; tags typed by the author stay visible text. */
export function articleInputHtml(
  html: string | undefined,
  text: string | undefined,
): string | undefined {
  if (text === undefined) return html;
  if (html !== undefined || typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 49152)
    throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r\n?/g, '\n');
  return `<p>${escaped.replace(/\n/g, '<br>')}</p>`;
}
