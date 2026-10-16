import { parseDocument } from 'htmlparser2';
import sanitizeHtml from 'sanitize-html';
import { MaterialPolicyError } from './material-policy.error.js';

export const ARTICLE_MAX_BYTES = 48 * 1024;
export const ARTICLE_MAX_DEPTH = 32;
export const ARTICLE_MAX_NODES = 5000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function inspect(html: string): { inlineFileIds: string[]; hasText: boolean } {
  const root = parseDocument(html, { decodeEntities: true });
  const pending = root.children.map((node) => ({ node, depth: 1 }));
  const ids = new Set<string>();
  let nodes = 0;
  let images = 0;
  let hasText = false;
  while (pending.length) {
    const item = pending.pop();
    if (!item) break;
    const { node, depth } = item;
    if (++nodes > ARTICLE_MAX_NODES || depth > ARTICLE_MAX_DEPTH)
      throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
    if (node.type === 'text' && node.data.replace(/[\s\u200b-\u200d\ufeff]/gu, '').length > 0)
      hasText = true;
    if ('attribs' in node && node.name === 'img') {
      if (++images > 50) throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
      const id = node.attribs['data-file-id'];
      if (id && UUID_V4.test(id)) ids.add(id.toLowerCase());
    }
    if ('children' in node)
      pending.push(...node.children.map((child) => ({ node: child, depth: depth + 1 })));
  }
  return { inlineFileIds: [...ids].sort(), hasText };
}

/** Canonical HTML only. File IDs are subsequently verified under transaction locks. */
export function sanitizeArticle(input: string): { contentHtml: string; inlineFileIds: string[] } {
  if (typeof input !== 'string') throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
  if (Buffer.byteLength(input, 'utf8') > ARTICLE_MAX_BYTES)
    throw new MaterialPolicyError('MATERIAL_CONTENT_TOO_LARGE');
  inspect(input);
  const contentHtml = sanitizeHtml(input, {
    allowedTags: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'hr',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'caption',
      'blockquote',
      'code',
      'pre',
      'a',
      'img',
      'figure',
      'figcaption',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['data-file-id', 'alt'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    parseStyleAttributes: false,
    nonTextTags: [
      'script',
      'style',
      'textarea',
      'option',
      'iframe',
      'object',
      'embed',
      'svg',
      'math',
    ],
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href;
        return {
          tagName,
          attribs: {
            ...(attribs.title ? { title: attribs.title } : {}),
            ...(href && /^(https?:\/\/|mailto:)/i.test(href) ? { href } : {}),
          },
        };
      },
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...(attribs['data-file-id'] && UUID_V4.test(attribs['data-file-id'])
            ? { 'data-file-id': attribs['data-file-id'].toLowerCase() }
            : {}),
          ...(attribs.alt ? { alt: attribs.alt } : {}),
        },
      }),
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs['data-file-id'],
  });
  if (Buffer.byteLength(contentHtml, 'utf8') > ARTICLE_MAX_BYTES)
    throw new MaterialPolicyError('MATERIAL_CONTENT_TOO_LARGE');
  const { inlineFileIds, hasText } = inspect(contentHtml);
  if (!hasText && inlineFileIds.length === 0)
    throw new MaterialPolicyError('MATERIAL_CONTENT_INVALID');
  return { contentHtml, inlineFileIds };
}
