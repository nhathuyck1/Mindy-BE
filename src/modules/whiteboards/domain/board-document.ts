import { isUUID } from 'class-validator';
import * as Y from 'yjs';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
import { CODE_SHAPE_LANGUAGES, type CodeShapeLanguage } from './code-tokens.js';

export const BOARD_LIMITS = {
  elements: 2000,
  points: 100000,
  updateBytes: 262144,
  documentBytes: 4194304,
};
export interface BoardShape {
  id: string;
  type: 'sticky' | 'stroke' | 'image' | 'rectangle' | 'ellipse' | 'text' | 'code';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
  points?: number[];
  strokeWidth?: number;
  assetId?: string;
  fill?: string;
  fontSize?: number;
  language?: CodeShapeLanguage;
}
export function boardError(status: number, code: string): never {
  throw new AppHttpException(status, code, code);
}
const finite = (v: unknown, min = -100000, max = 100000): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Reject unknown roots/fields, unresolved CRDT dependencies and unbounded render inputs. */
export function projectBoard(doc: Y.Doc): BoardShape[] {
  const shapes = doc.getMap<Y.Map<unknown>>('shapes');
  if (
    [...doc.share.keys()].some((k) => k !== 'shapes') ||
    shapes.size > BOARD_LIMITS.elements ||
    doc.store.pendingStructs ||
    doc.store.pendingDs
  )
    boardError(422, 'BOARD_SCHEMA_INVALID');
  let points = 0;
  const result: BoardShape[] = [];
  shapes.forEach((shape, id) => {
    if (!(shape instanceof Y.Map) || !isUUID(id, '4')) boardError(422, 'BOARD_SCHEMA_INVALID');
    const v = shape.toJSON() as Record<string, unknown>;
    const fields: Record<string, string[]> = {
      sticky: ['text'],
      text: ['text', 'fontSize'],
      code: ['text', 'fontSize', 'language'],
      stroke: ['points', 'strokeWidth'],
      image: ['assetId'],
      rectangle: ['strokeWidth', 'fill'],
      ellipse: ['strokeWidth', 'fill'],
    };
    const allowed = [
      'id',
      'type',
      'x',
      'y',
      'width',
      'height',
      'color',
      ...(fields[String(v.type)] ?? []),
    ];
    if (
      Object.keys(v).some((k) => !allowed.includes(k)) ||
      v.id !== id ||
      !['sticky', 'stroke', 'image', 'rectangle', 'ellipse', 'text', 'code'].includes(
        String(v.type),
      ) ||
      !finite(v.x) ||
      !finite(v.y) ||
      !finite(v.width, 1, 10000) ||
      !finite(v.height, 1, 10000) ||
      typeof v.color !== 'string' ||
      !/^#[\da-f]{6}$/i.test(v.color)
    )
      boardError(422, 'BOARD_SCHEMA_INVALID');
    if (
      ['sticky', 'text', 'code'].includes(String(v.type)) &&
      (!(shape.get('text') instanceof Y.Text) || typeof v.text !== 'string' || v.text.length > 5000)
    )
      boardError(422, 'BOARD_SCHEMA_INVALID');
    if (v.type === 'text' && !finite(v.fontSize, 12, 96)) boardError(422, 'BOARD_SCHEMA_INVALID');
    if (
      v.type === 'code' &&
      (!finite(v.fontSize, 10, 32) ||
        !CODE_SHAPE_LANGUAGES.includes(v.language as CodeShapeLanguage))
    )
      boardError(422, 'BOARD_SCHEMA_INVALID');
    if (
      ['rectangle', 'ellipse'].includes(String(v.type)) &&
      (!finite(v.strokeWidth, 1, 48) ||
        typeof v.fill !== 'string' ||
        (v.fill !== 'transparent' && !/^#[\da-f]{6}$/i.test(v.fill)))
    )
      boardError(422, 'BOARD_SCHEMA_INVALID');
    if (v.type === 'image' && (typeof v.assetId !== 'string' || !isUUID(v.assetId, '4')))
      boardError(422, 'BOARD_SCHEMA_INVALID');
    if (v.type === 'stroke') {
      if (
        !Array.isArray(v.points) ||
        v.points.length < 4 ||
        v.points.length % 2 ||
        v.points.length > 20000 ||
        !v.points.every((n) => finite(n)) ||
        !finite(v.strokeWidth, 1, 48)
      )
        boardError(422, 'BOARD_SCHEMA_INVALID');
      points += v.points.length / 2;
    }
    if (points > BOARD_LIMITS.points) boardError(413, 'BOARD_QUOTA_EXCEEDED');
    result.push(v as unknown as BoardShape);
  });
  if (Y.encodeStateAsUpdate(doc).byteLength > BOARD_LIMITS.documentBytes)
    boardError(413, 'BOARD_QUOTA_EXCEEDED');
  return result;
}

export function loadDocument(binary: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  doc.getMap('shapes');
  try {
    Y.applyUpdate(doc, binary);
  } catch {
    doc.destroy();
    boardError(422, 'BOARD_UPDATE_INVALID');
  }
  return doc;
}

export function decodeUpdate(value: string): Buffer {
  if (
    !value ||
    value.length > Math.ceil(BOARD_LIMITS.updateBytes / 3) * 4 ||
    !/^[A-Za-z\d+/]+={0,2}$/.test(value)
  )
    boardError(413, 'BOARD_UPDATE_INVALID');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || bytes.length > BOARD_LIMITS.updateBytes)
    boardError(422, 'BOARD_UPDATE_INVALID');
  return bytes;
}
