import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import { FILE_STORAGE, type FileStorage } from '../files/files.contracts.js';
import {
  BINARY_VALIDATOR,
  type BinaryValidator,
} from '../files/services/binary-validation.service.js';
import { fileProcessingDiagnostics } from '../files/services/file-processing-diagnostics.js';
import { BOARD_RENDERER, type BoardRenderer } from './board-renderer.service.js';
import type { BoardAssetRow, BoardExportRow } from './whiteboard-media.service.js';

const exec = promisify(execFile);
type MediaStage =
  | 'CREATE_SCRATCH'
  | 'READ_ASSETS'
  | 'VALIDATE_ASSET'
  | 'IMPORT_PDF'
  | 'WRITE_IMAGE'
  | 'PREPARE_RENDER'
  | 'RENDER'
  | 'READ_OUTPUT'
  | 'STORE_OUTPUT'
  | 'SAVE_RESULT';
type ReportStage = (stage: MediaStage) => void;
@Injectable()
export class WhiteboardMediaWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WhiteboardMediaWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private task?: Promise<void>;
  private active?: AbortController;
  private stopping = false;
  private lastCleanup = 0;
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(BINARY_VALIDATOR) private readonly validator: BinaryValidator,
    @Inject(BOARD_RENDERER) private readonly renderer: BoardRenderer,
  ) {}
  onApplicationBootstrap(): void {
    if (
      !this.config.get<boolean>('WHITEBOARD_ENABLED', false) ||
      !this.config.get<boolean>('MINIO_ENABLED', false) ||
      !this.config.get<boolean>('WHITEBOARD_WORKER_ENABLED', true)
    )
      return;
    this.timer = setInterval(() => {
      if (!this.task && !this.stopping) {
        this.task = this.tick()
          .catch((error: unknown) => {
            this.logger.error({
              event: 'WHITEBOARD_WORKER_ERROR',
              ...fileProcessingDiagnostics(error),
            });
          })
          .finally(() => {
            this.task = undefined;
          });
      }
    }, 1000);
    this.timer.unref();
  }
  async tick(): Promise<void> {
    const token = randomUUID();
    const [assets]: [BoardAssetRow[], number] = await this.db.query(
      `UPDATE whiteboard_assets SET lease_token=$1,lease_until=clock_timestamp()+interval '180 seconds',attempts=attempts+1
      WHERE id=(SELECT id FROM whiteboard_assets WHERE status='PROCESSING' AND (lease_until IS NULL OR lease_until<clock_timestamp())
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,
      [token],
    );
    const asset = assets[0];
    if (asset) {
      await this.process('whiteboard_assets', asset, (stage) => this.asset(asset, stage));
      return;
    }
    const [jobs]: [BoardExportRow[], number] = await this.db.query(
      `UPDATE whiteboard_exports SET status='RUNNING',lease_token=$1,lease_until=clock_timestamp()+interval '180 seconds',attempts=attempts+1
      WHERE id=(SELECT id FROM whiteboard_exports WHERE status IN ('QUEUED','RUNNING') AND (lease_until IS NULL OR lease_until<clock_timestamp())
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,
      [token],
    );
    const job = jobs[0];
    if (job) await this.process('whiteboard_exports', job, (stage) => this.export(job, stage));
    else if (Date.now() - this.lastCleanup > 60000) {
      this.lastCleanup = Date.now();
      await this.cleanup();
    }
  }
  /** Seven-day grace; lock the board before checking all durable asset references. */
  async cleanup(): Promise<void> {
    if (!this.storage.deleteAllVersions) return;
    const assets: BoardAssetRow[] =
      await this.db.query(`SELECT * FROM whiteboard_assets WHERE created_at<now()-interval '7 days'
      AND status IN ('PENDING_UPLOAD','FAILED','READY','IMPORTED','DELETING') ORDER BY created_at LIMIT 10`);
    for (const a of assets) {
      const remove = await this.db.transaction(async (m) => {
        const board = await m.query('SELECT id FROM whiteboards WHERE id=$1 FOR UPDATE', [
          a.board_id,
        ]);
        if (!board.length) return false;
        const refs = await m.query(
          `SELECT 1 FROM whiteboards WHERE id=$1 AND projection @> $2::jsonb
          UNION ALL SELECT 1 FROM whiteboard_snapshots WHERE board_id=$1 AND projection @> $2::jsonb
          UNION ALL SELECT 1 FROM whiteboard_exports WHERE board_id=$1 AND projection @> $2::jsonb LIMIT 1`,
          [a.board_id, JSON.stringify([{ assetId: a.id }])],
        );
        if (refs.length) return false;
        const changed = await m.query(
          "UPDATE whiteboard_assets SET status='DELETING' WHERE id=$1 AND status IN ('PENDING_UPLOAD','FAILED','READY','IMPORTED','DELETING') RETURNING id",
          [a.id],
        );
        return changed[0].length > 0;
      });
      if (!remove) continue;
      if (a.staging_key) await this.storage.deleteAllVersions(a.bucket, a.staging_key);
      if (a.object_key) await this.storage.deleteAllVersions(a.bucket, a.object_key);
      await this.db.query(
        "UPDATE whiteboard_assets SET status='DELETED' WHERE id=$1 AND status='DELETING'",
        [a.id],
      );
    }
  }
  private async process(
    table: 'whiteboard_assets' | 'whiteboard_exports',
    job: BoardAssetRow | BoardExportRow,
    action: (reportStage: ReportStage) => Promise<void>,
  ): Promise<void> {
    const controller = new AbortController();
    this.active = controller;
    const timeout = setTimeout(() => controller.abort(), 150000);
    timeout.unref();
    let stage: MediaStage = 'CREATE_SCRATCH';
    try {
      if (job.attempts > 3) throw new Error('Attempts exhausted');
      await action((value) => {
        stage = value;
      });
    } catch (error: unknown) {
      const errorCode =
        table === 'whiteboard_exports' ? `BOARD_EXPORT_${stage}_FAILED` : 'BOARD_MEDIA_FAILED';
      this.logger.warn({
        event: job.attempts >= 3 ? 'WHITEBOARD_MEDIA_FAILED' : 'WHITEBOARD_MEDIA_RETRY',
        jobId: job.id,
        boardId: job.board_id,
        attempt: job.attempts,
        stage,
        errorCode,
        ...fileProcessingDiagnostics(error),
      });
      // Failures are durable. No payload/parser/storage details are exposed to clients.
      await this.db.query(
        `UPDATE ${table} SET status=$3,error_code=$4,lease_until=NULL
        WHERE id=$1 AND lease_token=$2`,
        [
          job.id,
          job.lease_token,
          job.attempts >= 3 ? 'FAILED' : table === 'whiteboard_assets' ? 'PROCESSING' : 'QUEUED',
          errorCode,
        ],
      );
    } finally {
      clearTimeout(timeout);
      controller.abort();
      this.active = undefined;
    }
  }
  private signal(): AbortSignal {
    if (!this.active) throw new Error('No active lease');
    return this.active.signal;
  }
  private async bytes(a: BoardAssetRow, ready = false): Promise<Buffer> {
    const key = ready ? a.object_key : a.staging_key,
      versionId = ready ? a.object_version : a.staging_version;
    if (!key || !versionId) throw new Error('Missing pinned object');
    const stream = await this.storage.read({ bucket: a.bucket, key, versionId }, this.signal());
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      this.signal().throwIfAborted();
      const b = Buffer.from(chunk as Uint8Array);
      size += b.length;
      if (size > 10485760) {
        stream.destroy();
        throw new Error('Object quota');
      }
      chunks.push(b);
    }
    return Buffer.concat(chunks);
  }
  private async scratch<T>(action: (directory: string) => Promise<T>): Promise<T> {
    const root = resolve(this.config.getOrThrow<string>('FILE_SCRATCH_DIRECTORY'));
    // Same scratch root as Files; create it without enumerating or moving any paths.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(join(root, 'whiteboard-'));
    if (!resolve(directory).startsWith(root + sep)) throw new Error('Unexpected scratch path');
    try {
      return await action(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  private async writeImage(
    a: BoardAssetRow,
    id: string,
    bytes: Buffer,
  ): Promise<{
    id: string;
    width: number;
    height: number;
    key: string;
    version: string;
    size: number;
  }> {
    if (!this.storage.put) throw new Error('Storage PUT unavailable');
    const meta = await sharp(bytes, { limitInputPixels: 20000000 }).metadata();
    if (
      !meta.width ||
      !meta.height ||
      meta.width * meta.height > 20000000 ||
      !['png', 'jpeg'].includes(meta.format ?? '') ||
      (meta.pages ?? 1) > 1
    )
      throw new Error('Image quota');
    // Re-encode to remove metadata and active/polyglot trailers. Bound the resulting object too.
    const png = await sharp(bytes, { limitInputPixels: 20000000 })
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });
    if (png.data.length > 10485760) throw new Error('Image quota');
    const key = `whiteboards/${a.board_id}/assets/${id}/${a.lease_token}.png`;
    const version = await this.storage.put(a.bucket, key, png.data, 'image/png', this.signal());
    return {
      id,
      width: png.info.width,
      height: png.info.height,
      key,
      version,
      size: png.data.length,
    };
  }
  private async asset(a: BoardAssetRow, stage: ReportStage): Promise<void> {
    await this.scratch(async (directory) => {
      stage('READ_ASSETS');
      const bytes = await this.bytes(a),
        source = join(directory, 'source');
      if (bytes.length !== a.size_bytes) throw new Error('Size mismatch');
      await writeFile(source, bytes);
      stage('VALIDATE_ASSET');
      await this.validator.validate(
        source,
        { filename: a.filename, mimeType: a.mime_type, sizeBytes: a.size_bytes },
        this.signal(),
      );
      if (a.mime_type === 'application/pdf') {
        stage('IMPORT_PDF');
        if (!this.config.get<boolean>('WHITEBOARD_PDF_ENABLED', false))
          throw new Error('PDF disabled');
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
        if (
          pdf.getPageCount() > 100 ||
          !a.pages?.length ||
          a.pages.length > 10 ||
          a.pages.some((p) => p > pdf.getPageCount())
        )
          throw new Error('PDF quota');
        const images: Awaited<ReturnType<WhiteboardMediaWorker['writeImage']>>[] = [];
        for (const page of a.pages) {
          const prefix = join(directory, `page-${page}`);
          await exec(
            this.config.get<string>('WHITEBOARD_PDFTOPPM_PATH', 'pdftoppm'),
            [
              '-f',
              String(page),
              '-l',
              String(page),
              '-singlefile',
              '-scale-to',
              '1400',
              '-png',
              source,
              prefix,
            ],
            { timeout: 20000, maxBuffer: 65536, signal: this.signal(), windowsHide: true },
          );
          images.push(await this.writeImage(a, randomUUID(), await readFile(`${prefix}.png`)));
        }
        await this.db.transaction(async (m) => {
          const owned = await m.query(
            'SELECT 1 FROM whiteboard_assets WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp() FOR UPDATE',
            [a.id, a.lease_token],
          );
          if (!owned.length) throw new Error('Lease lost');
          for (const img of images)
            await m.query(
              `INSERT INTO whiteboard_assets(id,board_id,owner_id,filename,mime_type,size_bytes,bucket,staging_key,object_key,object_version,width,height,status)
            VALUES($1,$2,$3,$4,'image/png',$5,$6,'',$7,$8,$9,$10,'READY')`,
              [
                img.id,
                a.board_id,
                a.owner_id,
                'trang.pdf.png',
                img.size,
                a.bucket,
                img.key,
                img.version,
                img.width,
                img.height,
              ],
            );
          await m.query(
            "UPDATE whiteboard_assets SET status='IMPORTED',result=$3,lease_until=NULL WHERE id=$1 AND lease_token=$2",
            [
              a.id,
              a.lease_token,
              JSON.stringify(images.map(({ id, width, height }) => ({ id, width, height }))),
            ],
          );
        });
      } else {
        stage('WRITE_IMAGE');
        const img = await this.writeImage(a, a.id, bytes);
        await this.db.query(
          `UPDATE whiteboard_assets SET status='READY',object_key=$3,object_version=$4,width=$5,height=$6,mime_type='image/png',lease_until=NULL
          WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp()`,
          [a.id, a.lease_token, img.key, img.version, img.width, img.height],
        );
      }
    });
  }
  private async export(e: BoardExportRow, stage: ReportStage): Promise<void> {
    await this.scratch(async (directory) => {
      stage('READ_ASSETS');
      const images: Record<string, string> = {};
      const ids = [...new Set(e.projection.flatMap((s) => (s.assetId ? [s.assetId] : [])))];
      if (ids.length) {
        const assets: BoardAssetRow[] = await this.db.query(
          "SELECT * FROM whiteboard_assets WHERE board_id=$1 AND id=ANY($2::uuid[]) AND status='READY'",
          [e.board_id, ids],
        );
        if (assets.length !== ids.length) throw new Error('Asset missing');
        let total = 0;
        for (const a of assets) {
          const bytes = await this.bytes(a, true);
          total += bytes.length;
          if (total > 52428800) throw new Error('Render quota');
          images[a.id] = `data:image/png;base64,${bytes.toString('base64')}`;
        }
      }
      stage('PREPARE_RENDER');
      const input = join(directory, 'render.json'),
        output = join(directory, 'result');
      await writeFile(
        input,
        JSON.stringify({ shapes: e.projection, bounds: e.viewport, images, format: e.format }),
      );
      stage('RENDER');
      await this.renderer.render(input, output, this.signal());
      stage('READ_OUTPUT');
      const bytes = await readFile(output);
      if (bytes.length > 52428800 || !this.storage.put) throw new Error('Export quota');
      const bucket = this.config.getOrThrow<string>('MINIO_BUCKET'),
        key = `whiteboards/${e.board_id}/exports/${e.id}/${e.lease_token}`;
      stage('STORE_OUTPUT');
      const version = await this.storage.put(
        bucket,
        key,
        bytes,
        e.format === 'PNG' ? 'image/png' : 'application/pdf',
        this.signal(),
      );
      stage('SAVE_RESULT');
      await this.db.query(
        `UPDATE whiteboard_exports SET status='COMPLETED',error_code=NULL,bucket=$3,object_key=$4,object_version=$5,
        completed_at=clock_timestamp(),lease_until=NULL WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp()`,
        [e.id, e.lease_token, bucket, key, version],
      );
    });
  }
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    this.active?.abort();
    await this.task;
  }
}
