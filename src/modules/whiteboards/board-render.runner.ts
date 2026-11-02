import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { BoardShape } from './domain/board-document.js';
import { type BoardBounds, boardSvg } from './domain/board-render.js';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) throw new Error('Render paths required');
const input = JSON.parse(await readFile(inputPath, 'utf8')) as {
  shapes: BoardShape[];
  bounds: BoardBounds;
  images: Record<string, string>;
  format: 'PNG' | 'PDF';
};
const png = await sharp(Buffer.from(boardSvg(input.shapes, input.bounds, input.images)), {
  limitInputPixels: 16000000,
})
  .png()
  .toBuffer();
if (input.format === 'PDF') {
  const pdf = await PDFDocument.create(),
    image = await pdf.embedPng(png);
  // One scaled page for the requested bounds. Core has no multi-frame/paginated canvas.
  const scale = Math.min(1, 14400 / Math.max(image.width, image.height));
  const page = pdf.addPage([image.width * scale, image.height * scale]);
  page.drawImage(image, { x: 0, y: 0, width: image.width * scale, height: image.height * scale });
  await writeFile(outputPath, await pdf.save());
} else await writeFile(outputPath, png);
