import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { FILE_STORAGE, type FileStorage } from '../files/files.contracts.js';
import { boardError } from './domain/board-document.js';
import { contentBounds, validateBounds } from './domain/board-render.js';
import type { BoardAssetInput, BoardExportInput } from './whiteboard-media.dto.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { WhiteboardsService } from './whiteboards.service.js';

export interface BoardAssetRow {
  id: string;
  board_id: string;
  owner_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  bucket: string;
  staging_key: string;
  staging_version: string | null;
  object_key: string | null;
  object_version: string | null;
  status: string;
  error_code: string | null;
  width: number | null;
  height: number | null;
  pages: number[] | null;
  result: unknown;
  expires_at: Date;
  lease_token: string;
  attempts: number;
}
export interface BoardExportRow {
  id: string;
  board_id: string;
  owner_id: string;
  format: 'PNG' | 'PDF';
  epoch: string;
  source_sequence: string;
  projection: import('./domain/board-document.js').BoardShape[];
  viewport: import('./domain/board-render.js').BoardBounds;
  status: string;
  error_code: string | null;
  created_at: Date;
  completed_at: Date | null;
  bucket: string;
  object_key: string;
  object_version: string;
  lease_token: string;
  attempts: number;
}
@Injectable()
export class WhiteboardMediaService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly boards: WhiteboardsService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}
  private enabled(pdf = false): void {
    this.boards.enabled();
    if (!this.config.get<boolean>('MINIO_ENABLED', false))
      boardError(503, 'BOARD_STORAGE_UNAVAILABLE');
    if (pdf && !this.config.get<boolean>('WHITEBOARD_PDF_ENABLED', false))
      boardError(409, 'BOARD_PDF_DISABLED');
  }
  summary(a: BoardAssetRow) {
    return {
      id: a.id,
      status: a.status,
      error: a.error_code,
      width: a.width,
      height: a.height,
      assets: a.result,
    };
  }
  async intent(actor: AuthenticatedUser, id: string, key: string, input: BoardAssetInput) {
    this.enabled(input.mimeType === 'application/pdf');
    if (
      (input.mimeType === 'application/pdf') !== !!input.pages ||
      !{ 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'application/pdf': ['.pdf'] }[
        input.mimeType
      ].includes(extname(input.filename).toLowerCase()) ||
      [...input.filename].some(
        (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === '/' || c === '\\',
      )
    )
      boardError(422, 'BOARD_INVALID_INPUT');
    await this.storage.assertAvailable();
    const asset = await this.boards.command(actor, id, key, 'asset-intent', input, async (m) => {
      const count: { n: string; bytes: string }[] = await m.query(
        `SELECT count(*) AS n,COALESCE(sum(size_bytes),0) AS bytes FROM whiteboard_assets
        WHERE board_id=$1 AND status NOT IN ('FAILED','DELETED')`,
        [id],
      );
      if (Number(count[0]?.n) >= 100 || Number(count[0]?.bytes) + input.sizeBytes > 104857600)
        boardError(413, 'BOARD_ASSET_QUOTA');
      const assetId = randomUUID(),
        bucket = this.config.getOrThrow<string>('MINIO_BUCKET');
      const rows: BoardAssetRow[] = await m.query(
        `INSERT INTO whiteboard_assets(id,board_id,owner_id,filename,mime_type,size_bytes,bucket,staging_key,pages)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          assetId,
          id,
          actor.userId,
          input.filename,
          input.mimeType,
          input.sizeBytes,
          bucket,
          `whiteboards/${id}/staging/${assetId}`,
          input.pages ? JSON.stringify(input.pages) : null,
        ],
      );
      const row = rows[0];
      if (!row) boardError(503, 'BOARD_UNAVAILABLE');
      return {
        id: row.id,
        bucket: row.bucket,
        stagingKey: row.staging_key,
        expiresAt: row.expires_at,
      };
    });
    if (new Date(asset.expiresAt).getTime() <= Date.now()) boardError(409, 'BOARD_UPLOAD_EXPIRED');
    return {
      id: asset.id,
      status: 'PENDING_UPLOAD',
      putUrl: await this.storage.presignPut(asset.bucket, asset.stagingKey, input.mimeType, 300),
      expiresAt: asset.expiresAt,
    };
  }
  async complete(actor: AuthenticatedUser, id: string, assetId: string, key: string) {
    this.enabled();
    // Pin the exact server-observed object version. Later PUTs cannot replace validated bytes.
    const observed = await this.db.transaction(async (m) => {
      const { scope } = await this.boards.load(m, actor, id);
      const rows: BoardAssetRow[] = await m.query(
        'SELECT * FROM whiteboard_assets WHERE id=$1 AND board_id=$2',
        [assetId, id],
      );
      const a = rows[0];
      if (!scope.mentor || !a || a.owner_id !== actor.userId)
        boardError(404, 'BOARD_ASSET_NOT_FOUND');
      return a;
    });
    const head = observed.staging_version
      ? null
      : await this.storage.head(observed.bucket, observed.staging_key);
    return this.boards.command(actor, id, key, `complete/${assetId}`, {}, async (m) => {
      const rows: BoardAssetRow[] = await m.query(
        'SELECT * FROM whiteboard_assets WHERE id=$1 AND board_id=$2 FOR UPDATE',
        [assetId, id],
      );
      const a = rows[0];
      if (!a || a.owner_id !== actor.userId) boardError(404, 'BOARD_ASSET_NOT_FOUND');
      if (a.status !== 'PENDING_UPLOAD') return this.summary(a);
      if (a.expires_at.getTime() <= Date.now()) boardError(409, 'BOARD_UPLOAD_EXPIRED');
      if (!head || head.size !== a.size_bytes) boardError(422, 'BOARD_FILE_SIZE_MISMATCH');
      await m.query(
        "UPDATE whiteboard_assets SET status='PROCESSING',staging_version=$2 WHERE id=$1",
        [a.id, head.versionId],
      );
      return { ...this.summary(a), status: 'PROCESSING' };
    });
  }
  async status(actor: AuthenticatedUser, id: string, assetId: string) {
    return this.db.transaction(async (m) => {
      const { scope } = await this.boards.load(m, actor, id);
      const rows: BoardAssetRow[] = await m.query(
        'SELECT * FROM whiteboard_assets WHERE id=$1 AND board_id=$2',
        [assetId, id],
      );
      const a = rows[0];
      if (!scope.mentor || !a) boardError(404, 'BOARD_ASSET_NOT_FOUND');
      return this.summary(a);
    });
  }
  async access(actor: AuthenticatedUser, id: string, assetId: string) {
    this.enabled();
    const a = await this.db.transaction(async (m) => {
      const { b, scope } = await this.boards.load(m, actor, id);
      let referenced = b.projection.some((s) => s.assetId === assetId);
      if (!referenced && scope.mentor)
        referenced =
          (
            await m.query(
              'SELECT 1 FROM whiteboard_snapshots WHERE board_id=$1 AND projection @> $2::jsonb LIMIT 1',
              [id, JSON.stringify([{ assetId }])],
            )
          ).length > 0;
      const rows: BoardAssetRow[] = await m.query(
        "SELECT * FROM whiteboard_assets WHERE id=$1 AND board_id=$2 AND status='READY'",
        [assetId, id],
      );
      const asset = rows[0];
      // Mentor needs access immediately after validation, before committing its image shape.
      if (!asset || (!referenced && !(scope.mentor && asset.owner_id === actor.userId)))
        boardError(404, 'BOARD_ASSET_NOT_FOUND');
      return asset;
    });
    if (!a.object_key || !a.object_version) boardError(409, 'BOARD_ASSET_NOT_READY');
    return {
      url: await this.storage.presignGet(
        { bucket: a.bucket, key: a.object_key, versionId: a.object_version },
        a.filename,
        60,
        'inline',
      ),
      expiresAt: new Date(Date.now() + 60000),
    };
  }
  async export(actor: AuthenticatedUser, id: string, key: string, input: BoardExportInput) {
    this.enabled(input.format === 'PDF');
    return this.boards.command(actor, id, key, 'export', input, async (m, b) => {
      if (b.epoch !== input.expectedEpoch) boardError(409, 'BOARD_EPOCH_CHANGED');
      if ((input.scope === 'VIEWPORT') !== !!input.viewport) boardError(422, 'BOARD_INVALID_INPUT');
      const bounds = input.viewport ?? contentBounds(b.projection);
      validateBounds(bounds);
      const pending = await m.query(
        "SELECT 1 FROM whiteboard_exports WHERE board_id=$1 AND status IN ('QUEUED','RUNNING') LIMIT 3",
        [id],
      );
      if (pending.length >= 3) boardError(429, 'BOARD_EXPORT_LIMIT');
      const rows: BoardExportRow[] = await m.query(
        `INSERT INTO whiteboard_exports(board_id,owner_id,format,epoch,source_sequence,projection,viewport)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          id,
          actor.userId,
          input.format,
          b.epoch,
          b.sequence,
          JSON.stringify(b.projection),
          JSON.stringify(bounds),
        ],
      );
      const e = rows[0];
      if (!e) boardError(503, 'BOARD_UNAVAILABLE');
      return this.exportSummary(e);
    });
  }
  exportSummary(e: BoardExportRow) {
    return {
      id: e.id,
      status: e.status,
      format: e.format,
      sourceSequence: e.source_sequence,
      createdAt: e.created_at,
      completedAt: e.completed_at,
      error: e.error_code,
    };
  }
  async exportStatus(actor: AuthenticatedUser, id: string, exportId: string, download = false) {
    this.enabled();
    const job = await this.db.transaction(async (m) => {
      const { scope } = await this.boards.load(m, actor, id);
      if (!scope.mentor) boardError(403, 'BOARD_ACCESS_DENIED');
      const rows: BoardExportRow[] = await m.query(
        'SELECT * FROM whiteboard_exports WHERE id=$1 AND board_id=$2',
        [exportId, id],
      );
      const e = rows[0];
      if (!e) boardError(404, 'BOARD_EXPORT_NOT_FOUND');
      return e;
    });
    if (!download) return this.exportSummary(job);
    if (job.status !== 'COMPLETED') boardError(409, 'BOARD_EXPORT_NOT_READY');
    return {
      url: await this.storage.presignGet(
        { bucket: job.bucket, key: job.object_key, versionId: job.object_version },
        `bang-ve.${job.format.toLowerCase()}`,
        60,
        'attachment',
      ),
      expiresAt: new Date(Date.now() + 60000),
    };
  }
}
