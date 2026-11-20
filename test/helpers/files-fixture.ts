import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

const ffmpeg: unknown = createRequire(import.meta.url)('ffmpeg-static');

import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { ZipFile } from 'yazl';
import { environmentSchema } from '../../src/config/environment.schema.js';
import { PrivateFileUploads1791504000001 } from '../../src/database/migrations/1791504000001-private-file-uploads.js';
import { FileMetadataEntity } from '../../src/modules/files/entities/file-metadata.entity.js';
import { FileObjectEntity } from '../../src/modules/files/entities/file-object.entity.js';
import { FileProcessingJobEntity } from '../../src/modules/files/entities/file-processing-job.entity.js';
import { MinioFileStorage } from '../../src/modules/files/storage/minio-file-storage.js';
import { paymentDatabase } from './payment-fixture.js';

export async function zipBuffer(entries: readonly (readonly [string, Buffer])[]): Promise<Buffer> {
  const zip = new ZipFile();
  for (const [name, bytes] of entries) zip.addBuffer(bytes, name);
  const chunks: Buffer[] = [];
  zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    zip.outputStream.once('end', resolve);
    zip.outputStream.once('error', reject);
  });
  zip.end();
  await done;
  return Buffer.concat(chunks);
}

export async function fileDatabase() {
  return paymentDatabase('files', {
    entities: [FileObjectEntity, FileMetadataEntity, FileProcessingJobEntity],
    migrations: [PrivateFileUploads1791504000001],
  });
}
export function fileConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const result = environmentSchema.validate({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    CORS_ORIGINS: 'http://localhost:3001',
    MINIO_ENABLED: true,
    MINIO_ENDPOINT: '127.0.0.1',
    MINIO_PORT: 19000,
    MINIO_ACCESS_KEY: 'mindy-files-test',
    MINIO_SECRET_KEY: 'mindy-files-test-only-password',
    MINIO_BUCKET: `mindy-files-${randomUUID()}-test`,
    FILE_JOB_ENABLED: false,
    ...overrides,
  });
  if (result.error)
    throw new Error('Files tests require a dedicated TEST_DATABASE_URL and local MinIO setup');
  return new ConfigService(result.value);
}
export async function storageFixture(
  config: ConfigService,
): Promise<{ storage: MinioFileStorage; client: S3Client; cleanup: () => Promise<void> }> {
  const endpoint = `http://127.0.0.1:${config.getOrThrow<number>('MINIO_PORT')}`;
  const Bucket = config.getOrThrow<string>('MINIO_BUCKET');
  if (!Bucket.endsWith('-test')) throw new Error('Only isolated -test buckets are permitted');
  const client = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretAccessKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
    },
    maxAttempts: 1,
  });
  await client.send(new CreateBucketCommand({ Bucket }));
  await client.send(
    new PutBucketVersioningCommand({ Bucket, VersioningConfiguration: { Status: 'Enabled' } }),
  );
  const storage = new MinioFileStorage(config);
  return {
    storage,
    client,
    cleanup: async () => {
      // Bucket name was generated specifically for this fixture; never enumerate other buckets.
      for (;;) {
        const versions = await client.send(
          new ListObjectVersionsCommand({ Bucket, MaxKeys: 1000 }),
        );
        const objects = [...(versions.Versions ?? []), ...(versions.DeleteMarkers ?? [])].map(
          (v) => ({ Key: v.Key, VersionId: v.VersionId }),
        );
        if (!objects.length) break;
        await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: objects } }));
      }
      await client.send(new DeleteBucketCommand({ Bucket }));
      client.destroy();
      storage.onModuleDestroy();
    },
  };
}
export async function upload(url: string, mimeType: string, bytes: Buffer): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': mimeType },
    body: new Uint8Array(bytes),
  });
  if (!response.ok) throw new Error(`Test PUT failed: ${response.status}`);
}
export interface BinaryFixture {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Buffer;
}
export async function binaryFixtures(): Promise<BinaryFixture[]> {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  const result: BinaryFixture[] = [
    { filename: 'lesson.pdf', mimeType: 'application/pdf', bytes: Buffer.from(await pdf.save()) },
    {
      filename: 'image.png',
      mimeType: 'image/png',
      bytes: await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } })
        .png()
        .toBuffer(),
    },
    {
      filename: 'image.jpg',
      mimeType: 'image/jpeg',
      bytes: await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } })
        .jpeg()
        .toBuffer(),
    },
  ];
  for (const [ext, root, mime] of [
    [
      'docx',
      'word/document.xml',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    [
      'pptx',
      'ppt/presentation.xml',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    [
      'xlsx',
      'xl/workbook.xml',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  ] as const) {
    const zip = new ZipFile();
    zip.addBuffer(
      Buffer.from(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${root}" ContentType="${mime.replace(/(document|presentation|sheet)$/, '$1.main+xml')}"/></Types>`,
      ),
      '[Content_Types].xml',
    );
    zip.addBuffer(
      Buffer.from(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${root}"/></Relationships>`,
      ),
      '_rels/.rels',
    );
    const elements = {
      docx: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
      pptx: '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
      xlsx: '<s:workbook xmlns:s="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><s:sheets/></s:workbook>',
    };
    zip.addBuffer(Buffer.from(elements[ext]), root);
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve, reject) => {
      zip.outputStream.once('end', resolve);
      zip.outputStream.once('error', reject);
    });
    zip.end();
    await done;
    result.push({ filename: `office.${ext}`, mimeType: mime, bytes: Buffer.concat(chunks) });
  }
  const directory = await mkdtemp(join(tmpdir(), 'mindy-binary-fixtures-'));
  try {
    if (typeof ffmpeg !== 'string') throw new Error('Missing test ffmpeg binary');
    await promisify(execFile)(
      ffmpeg,
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.2',
        join(directory, 'audio.mp3'),
      ],
      { windowsHide: true },
    );
    await promisify(execFile)(
      ffmpeg,
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=16x16:d=0.2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        join(directory, 'video.mp4'),
      ],
      { windowsHide: true },
    );
    result.push(
      {
        filename: 'audio.mp3',
        mimeType: 'audio/mpeg',
        bytes: await readFile(join(directory, 'audio.mp3')),
      },
      {
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        bytes: await readFile(join(directory, 'video.mp4')),
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  for (const extension of [
    'txt',
    'md',
    'csv',
    'json',
    'js',
    'ts',
    'py',
    'java',
    'c',
    'cpp',
    'h',
    'css',
    'sql',
  ])
    result.push({
      filename: `source.${extension}`,
      mimeType: 'text/plain',
      bytes: Buffer.from('Example source text. Not required to compile.'),
    });
  return result;
}
