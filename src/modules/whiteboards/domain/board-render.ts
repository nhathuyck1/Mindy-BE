import { type BoardShape, boardError } from './board-document.js';
import { CODE_SHAPE_PALETTE, codeLines } from './code-tokens.js';
export interface BoardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}
export function contentBounds(shapes: BoardShape[]): BoardBounds {
  if (!shapes.length) return { x: 0, y: 0, width: 1024, height: 768, scale: 1 };
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const s of shapes) {
    const pts = s.type === 'stroke' ? (s.points ?? []) : [];
    const xs = pts.filter((_, i) => i % 2 === 0),
      ys = pts.filter((_, i) => i % 2 === 1);
    const left = s.x + (xs.length ? Math.min(...xs) : 0),
      top = s.y + (ys.length ? Math.min(...ys) : 0);
    x = Math.min(x, left - 24);
    y = Math.min(y, top - 24);
    right = Math.max(right, s.x + (xs.length ? Math.max(...xs) : s.width) + 24);
    bottom = Math.max(bottom, s.y + (ys.length ? Math.max(...ys) : s.height) + 24);
  }
  return { x, y, width: Math.ceil(right - x), height: Math.ceil(bottom - y), scale: 1 };
}
export function validateBounds(b: BoardBounds): void {
  if (
    Object.values(b).some((n) => !Number.isFinite(n)) ||
    b.width <= 0 ||
    b.height <= 0 ||
    b.scale <= 0 ||
    b.width * b.scale > 4096 ||
    b.height * b.scale > 4096 ||
    b.width * b.height * b.scale * b.scale > 16000000
  )
    boardError(413, 'BOARD_EXPORT_TOO_LARGE');
}
const escapeXml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
/** Images are supplied by the private worker, never fetched from arbitrary SVG/client URLs. */
export function boardSvg(
  shapes: BoardShape[],
  bounds: BoardBounds,
  images: Record<string, string>,
): string {
  validateBounds(bounds);
  const content = shapes
    .map((s) => {
      if (s.type === 'stroke')
        return `<polyline transform="translate(${s.x} ${s.y})" points="${s.points?.join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
      if (s.type === 'image')
        return images[s.assetId ?? '']
          ? `<image x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" href="${images[s.assetId ?? '']}"/>`
          : '';
      if (s.type === 'rectangle')
        return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="${s.fill}" stroke="${s.color}" stroke-width="${s.strokeWidth}"/>`;
      if (s.type === 'ellipse')
        return `<ellipse cx="${s.x + s.width / 2}" cy="${s.y + s.height / 2}" rx="${s.width / 2}" ry="${s.height / 2}" fill="${s.fill}" stroke="${s.color}" stroke-width="${s.strokeWidth}"/>`;
      if (s.type === 'code') return codeSvg(s);
      const fontSize = s.type === 'text' ? (s.fontSize ?? 24) : 16,
        lineHeight = fontSize * 1.375;
      const lines = (s.text ?? '')
        .split('\n')
        .flatMap((line) => {
          const chars = Array.from(line),
            size = Math.max(1, Math.floor((s.width - 24) / (fontSize * 0.56)));
          return chars.length
            ? Array.from({ length: Math.ceil(chars.length / size) }, (_, i) =>
                chars.slice(i * size, (i + 1) * size).join(''),
              )
            : [''];
        })
        .slice(0, Math.max(1, Math.floor((s.height - 24) / lineHeight)));
      return `${s.type === 'sticky' ? `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="4" fill="${s.color}"/>` : ''}<text x="${s.x + 12}" y="${s.y + 12 + fontSize}" font-family="Nunito,Noto Sans,sans-serif" font-size="${fontSize}" fill="${s.type === 'text' ? s.color : '#1d302e'}">${lines.map((line, i) => `<tspan x="${s.x + 12}" dy="${i ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join('')}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(bounds.width * bounds.scale)}" height="${Math.ceil(bounds.height * bounds.scale)}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}"><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="white"/>${content}</svg>`;
}

/** Dark code card: header strip with the language, monospace lines coloured per token, clipped. */
function codeSvg(s: BoardShape): string {
  const fontSize = s.fontSize ?? 14,
    lineHeight = Math.round(fontSize * 1.55),
    header = Math.round(fontSize * 2),
    pad = 14,
    clip = `code-${s.id}`;
  const rows = codeLines(s.text ?? '', s.language ?? 'javascript')
    .slice(0, Math.max(1, Math.floor((s.height - header - pad) / lineHeight)))
    .map((line, i) => {
      const spans = line
        .map(
          (t) =>
            `<tspan fill="${CODE_SHAPE_PALETTE[t.kind]}"${t.kind === 'comment' ? ' font-style="italic"' : ''}>${escapeXml(t.text)}</tspan>`,
        )
        .join('');
      return `<text x="${s.x + pad}" y="${s.y + header + pad + fontSize + i * lineHeight}" xml:space="preserve">${spans}</text>`;
    })
    .join('');
  return `<clipPath id="${clip}"><rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="10"/></clipPath><g clip-path="url(#${clip})" font-family="JetBrains Mono,Menlo,Consolas,monospace" font-size="${fontSize}"><rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="${CODE_SHAPE_PALETTE.bg}"/><rect x="${s.x}" y="${s.y}" width="${s.width}" height="${header}" fill="${CODE_SHAPE_PALETTE.header}"/><text x="${s.x + pad}" y="${s.y + header / 2 + fontSize * 0.35}" fill="${CODE_SHAPE_PALETTE.muted}" font-size="${Math.round(fontSize * 0.85)}">${s.language === 'java21' ? 'Java' : 'JavaScript'}</text>${rows}</g>`;
}
