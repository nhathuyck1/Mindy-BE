import { isUUID } from 'class-validator';
import sanitizeHtml from 'sanitize-html';
import { MaterialPolicyException } from '../exceptions/material.exceptions.js';

export const MAX_MATERIAL_HTML_BYTES = 48 * 1024;

/** Canonical CKEditor HTML stores verified IDs, never storage URLs. */
export function sanitizeMaterialHtml(input: string): { html: string; inlineFileIds: string[] } {
  const invalid = (): never => {
    throw new MaterialPolicyException('MATERIAL_CONTENT_INVALID');
  };
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > MAX_MATERIAL_HTML_BYTES)
    invalid();
  let depth = 0;
  let nodes = 0;
  let imageNodes = 0;
  const inlineFileIds = new Set<string>();
  const html = sanitizeHtml(input, {
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
      'blockquote',
      'code',
      'pre',
      'a',
      'img',
      'figure',
      'figcaption',
      'span',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['data-file-id', 'alt'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      ol: ['start'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    parseStyleAttributes: false,
    onOpenTag: () => {
      if (++depth > 32 || ++nodes > 5000) invalid();
    },
    onCloseTag: () => {
      depth--;
    },
    textFilter: (text) => {
      if (++nodes > 5000) invalid();
      return text;
    },
    transformTags: {
      a: (tagName, attribs) => {
        // Relative/protocol-relative links are not part of the article contract.
        if (attribs.href && !/^(https?:\/\/|mailto:)/i.test(attribs.href)) delete attribs.href;
        return { tagName, attribs };
      },
      img: (tagName, attribs) => {
        const id = attribs['data-file-id'];
        if (!id || !isUUID(id, '4') || ++imageNodes > 50) return invalid();
        inlineFileIds.add(id.toLowerCase());
        return { tagName, attribs: { 'data-file-id': id.toLowerCase(), alt: attribs.alt ?? '' } };
      },
    },
  });
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .trim();
  if (
    (!text && inlineFileIds.size === 0) ||
    Buffer.byteLength(html, 'utf8') > MAX_MATERIAL_HTML_BYTES
  )
    invalid();
  return { html, inlineFileIds: [...inlineFileIds].sort() };
}
