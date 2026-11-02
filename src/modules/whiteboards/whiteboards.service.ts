import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import * as Y from 'yjs';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  type BoardShape,
  boardError,
  decodeUpdate,
  loadDocument,
  projectBoard,
} from './domain/board-document.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { WhiteboardAccessService } from './whiteboard-access.service.js';
import type {
  BoardPageQuery,
  ControlBoardInput,
  CreateBoardInput,
  ResetBoardInput,
  RestoreBoardInput,
} from './whiteboards.dto.js';

export interface BoardRow {
  id: string;
  session_id: string;
  title: string;
  mode: 'PRESENTATION' | 'COLLABORATIVE';
  epoch: string;
  control_version: string;
  sequence: string;
  schema_version: number;
  checkpoint: Buffer;
  projection: BoardShape[];
  last_persisted_at: Date;
}
const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
export interface BoardSyncState {
  board: ReturnType<WhiteboardsService['metadata']>;
  capabilities: ReturnType<WhiteboardsService['capabilities']>;
  binary: string;
  identity: { id: string; name: string };
}

@Injectable()
export class WhiteboardsService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly access: WhiteboardAccessService,
  ) {}
  enabled(): void {
    if (!this.config.get<boolean>('WHITEBOARD_ENABLED', false)) boardError(404, 'BOARD_DISABLED');
  }
  capabilities(scope: Awaited<ReturnType<WhiteboardAccessService['session']>>, mode?: string) {
    return {
      ...this.access.capabilities(scope, mode),
      canCollaborate: scope.mentor && scope.sessionStatus === 'IN_PROGRESS',
      canImportPdf: scope.mentor && this.config.get<boolean>('WHITEBOARD_PDF_ENABLED', false),
      canExportPdf: scope.mentor && this.config.get<boolean>('WHITEBOARD_PDF_ENABLED', false),
    };
  }
  metadata(b: BoardRow) {
    return {
      id: b.id,
      sessionId: b.session_id,
      title: b.title,
      mode: b.mode,
      epoch: b.epoch,
      controlVersion: b.control_version,
      sequence: b.sequence,
      schemaVersion: b.schema_version,
      lastPersistedAt: b.last_persisted_at,
    };
  }
  async context(actor: AuthenticatedUser, sessionId: string) {
    this.enabled();
    return this.db.transaction(async (m) => {
      const scope = await this.access.session(m, actor, sessionId, 'read');
      const rows: BoardRow[] = await m.query('SELECT * FROM whiteboards WHERE session_id=$1', [
        sessionId,
      ]);
      const b = rows[0];
      return {
        sessionId,
        board: b ? this.metadata(b) : null,
        context: scope,
        capabilities: {
          ...this.capabilities(scope, b?.mode),
          canEdit: b ? this.capabilities(scope, b.mode).canEdit : false,
        },
      };
    });
  }
  async get(actor: AuthenticatedUser, id: string) {
    this.enabled();
    return this.db.transaction(async (m) => {
      const { b, scope } = await this.load(m, actor, id, false);
      return {
        board: this.metadata(b),
        context: scope,
        capabilities: this.capabilities(scope, b.mode),
      };
    });
  }
  async create(actor: AuthenticatedUser, sessionId: string, key: string, input: CreateBoardInput) {
    this.enabled();
    return this.db.transaction(async (m) => {
      const scope = await this.access.session(m, actor, sessionId, true);
      if (!scope.mentor) boardError(403, 'BOARD_ACCESS_DENIED');
      return this.receipt(m, actor, key, `create/${sessionId}`, input, async () => {
        if ((await m.query('SELECT 1 FROM whiteboards WHERE session_id=$1', [sessionId])).length)
          boardError(409, 'BOARD_ALREADY_EXISTS');
        const doc = new Y.Doc();
        doc.getMap('shapes');
        const bytes = Buffer.from(Y.encodeStateAsUpdate(doc));
        doc.destroy();
        const rows: BoardRow[] = await m.query(
          `INSERT INTO whiteboards(session_id,title,checkpoint,created_by)
          VALUES($1,$2,$3,$4) RETURNING *`,
          [sessionId, input.title ?? scope.sessionTitle, bytes, actor.userId],
        );
        const b = rows[0];
        if (!b) boardError(503, 'BOARD_UNAVAILABLE');
        return {
          sessionId,
          board: this.metadata(b),
          context: scope,
          capabilities: this.capabilities(scope, b.mode),
        };
      });
    });
  }
  async sync(
    actor: AuthenticatedUser,
    id: string,
    deliver?: (state: BoardSyncState) => void,
  ): Promise<BoardSyncState> {
    this.enabled();
    return this.db.transaction(async (m) => {
      const { b, scope } = await this.load(m, actor, id, false);
      const state: BoardSyncState = {
        board: this.metadata(b),
        capabilities: this.capabilities(scope, b.mode),
        binary: b.checkpoint.toString('base64'),
        identity: { id: actor.userId, name: scope.displayName },
      };
      deliver?.(state);
      return state;
    });
  }
  async update(
    actor: AuthenticatedUser,
    id: string,
    epoch: string,
    updateId: string,
    binary: string,
  ) {
    this.enabled();
    if (!isUUID(updateId, '4') || !isUUID(epoch, '4')) boardError(422, 'BOARD_INVALID_INPUT');
    const bytes = decodeUpdate(binary),
      digest = hash(bytes);
    return this.db.transaction(async (m) => {
      const { b, scope } = await this.load(m, actor, id);
      if (!this.capabilities(scope, b.mode).canEdit) boardError(403, 'BOARD_READ_ONLY');
      if (epoch !== b.epoch) boardError(409, 'BOARD_EPOCH_CHANGED');
      const existing: { request_hash: string; sequence: string }[] = await m.query(
        'SELECT request_hash,sequence FROM whiteboard_updates WHERE board_id=$1 AND epoch=$2 AND actor_id=$3 AND update_id=$4',
        [id, epoch, actor.userId, updateId],
      );
      if (existing[0]) {
        if (existing[0].request_hash !== digest) boardError(409, 'BOARD_IDEMPOTENCY_CONFLICT');
        return { epoch, sequence: existing[0].sequence, updateId };
      }
      const doc = loadDocument(b.checkpoint);
      try {
        try {
          Y.applyUpdate(doc, bytes);
        } catch {
          boardError(422, 'BOARD_UPDATE_INVALID');
        }
        const projection = projectBoard(doc);
        const assetIds = projection.flatMap((s) => (s.assetId ? [s.assetId] : []));
        if (assetIds.length) {
          const rows: { id: string }[] = await m.query(
            "SELECT id FROM whiteboard_assets WHERE board_id=$1 AND status='READY' AND id=ANY($2::uuid[])",
            [id, assetIds],
          );
          if (new Set(assetIds).size !== rows.length) boardError(422, 'BOARD_ASSET_INVALID');
        }
        const sequence = (BigInt(b.sequence) + 1n).toString();
        await m.query(
          `UPDATE whiteboards SET checkpoint=$2,projection=$3,sequence=$4,last_persisted_at=clock_timestamp() WHERE id=$1`,
          [id, Buffer.from(Y.encodeStateAsUpdate(doc)), JSON.stringify(projection), sequence],
        );
        await m.query(
          `INSERT INTO whiteboard_updates(board_id,epoch,actor_id,update_id,request_hash,sequence) VALUES($1,$2,$3,$4,$5,$6)`,
          [id, epoch, actor.userId, updateId, digest, sequence],
        );
        return { epoch, sequence, updateId };
      } finally {
        doc.destroy();
      }
    });
  }
  async control(actor: AuthenticatedUser, id: string, key: string, input: ControlBoardInput) {
    return this.command(actor, id, key, 'control', input, async (m, b, scope) => {
      if (b.control_version !== input.expectedControlVersion)
        boardError(409, 'BOARD_VERSION_CONFLICT');
      if (input.title === undefined && input.mode === undefined)
        boardError(422, 'BOARD_INVALID_INPUT');
      if (input.mode === 'COLLABORATIVE' && scope.sessionStatus !== 'IN_PROGRESS')
        boardError(409, 'BOARD_SESSION_NOT_IN_PROGRESS');
      const [rows]: [BoardRow[], number] = await m.query(
        `UPDATE whiteboards SET title=COALESCE($2,title),mode=COALESCE($3,mode),control_version=control_version+1 WHERE id=$1 RETURNING *`,
        [id, input.title, input.mode],
      );
      if (!rows[0]) boardError(404, 'BOARD_NOT_FOUND');
      return this.metadata(rows[0]);
    });
  }
  async snapshot(actor: AuthenticatedUser, id: string, key: string, epoch: string) {
    return this.command(actor, id, key, 'snapshot', { epoch }, async (m, b) => {
      if (b.epoch !== epoch) boardError(409, 'BOARD_EPOCH_CHANGED');
      return this.saveSnapshot(m, b, 'MANUAL', actor.userId);
    });
  }
  async snapshots(actor: AuthenticatedUser, id: string, q: BoardPageQuery) {
    return this.db.transaction(async (m) => {
      const { scope } = await this.load(m, actor, id);
      if (!scope.mentor) boardError(403, 'BOARD_ACCESS_DENIED');
      const items = await m.query(
        `SELECT id,epoch,sequence,control_version AS "controlVersion",reason,created_at AS "createdAt",created_by AS "createdBy"
        FROM whiteboard_snapshots WHERE board_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3`,
        [id, q.pageSize, (q.page - 1) * q.pageSize],
      );
      const count: { total: string }[] = await m.query(
        'SELECT count(*) AS total FROM whiteboard_snapshots WHERE board_id=$1',
        [id],
      );
      return { items, total: Number(count[0]?.total ?? 0), page: q.page, pageSize: q.pageSize };
    });
  }
  async preview(actor: AuthenticatedUser, id: string, snapshotId: string) {
    return this.db.transaction(async (m) => {
      const { scope } = await this.load(m, actor, id);
      if (!scope.mentor) boardError(403, 'BOARD_ACCESS_DENIED');
      const rows = await m.query(
        `SELECT id,epoch,sequence,reason,projection,"created_at" AS "createdAt",schema_version AS "schemaVersion"
        FROM whiteboard_snapshots WHERE id=$1 AND board_id=$2`,
        [snapshotId, id],
      );
      if (!rows[0]) boardError(404, 'BOARD_SNAPSHOT_NOT_FOUND');
      return rows[0] as unknown;
    });
  }
  async reset(
    actor: AuthenticatedUser,
    id: string,
    key: string,
    input: ResetBoardInput | RestoreBoardInput,
  ) {
    return this.command(
      actor,
      id,
      key,
      'snapshotId' in input ? 'restore' : 'reset',
      input,
      async (m, b) => {
        if (
          b.epoch !== input.expectedEpoch ||
          b.sequence !== input.expectedSequence ||
          b.control_version !== input.expectedControlVersion
        )
          boardError(409, 'BOARD_VERSION_CONFLICT');
        let doc: Y.Doc;
        if ('snapshotId' in input) {
          const rows: { checkpoint: Buffer; checksum: string }[] = await m.query(
            'SELECT checkpoint,checksum FROM whiteboard_snapshots WHERE id=$1 AND board_id=$2',
            [input.snapshotId, id],
          );
          const s = rows[0];
          if (!s) boardError(404, 'BOARD_SNAPSHOT_NOT_FOUND');
          if (hash(s.checkpoint) !== s.checksum) boardError(503, 'BOARD_SNAPSHOT_CORRUPT');
          doc = loadDocument(s.checkpoint);
        } else {
          doc = new Y.Doc();
          doc.getMap('shapes');
        }
        try {
          const projection = projectBoard(doc);
          await this.saveSnapshot(m, b, 'BEFORE_RESET', actor.userId);
          const [rows]: [BoardRow[], number] = await m.query(
            `UPDATE whiteboards SET epoch=$2,sequence=0,control_version=control_version+1,
          checkpoint=$3,projection=$4,last_persisted_at=clock_timestamp() WHERE id=$1 RETURNING *`,
            [id, randomUUID(), Buffer.from(Y.encodeStateAsUpdate(doc)), JSON.stringify(projection)],
          );
          if (!rows[0]) boardError(404, 'BOARD_NOT_FOUND');
          return this.metadata(rows[0]);
        } finally {
          doc.destroy();
        }
      },
    );
  }
  async load(m: EntityManager, actor: AuthenticatedUser, id: string, write = true) {
    this.enabled();
    const initial: { session_id: string }[] = await m.query(
      'SELECT session_id FROM whiteboards WHERE id=$1',
      [id],
    );
    if (!initial[0]) boardError(404, 'BOARD_NOT_FOUND');
    const scope = await this.access.session(m, actor, initial[0].session_id, write ? true : 'read');
    const rows: BoardRow[] = await m.query(
      `SELECT * FROM whiteboards WHERE id=$1 ${write ? 'FOR UPDATE' : 'FOR SHARE'}`,
      [id],
    );
    const b = rows[0];
    if (!b) boardError(404, 'BOARD_NOT_FOUND');
    return { b, scope };
  }
  async command<T>(
    actor: AuthenticatedUser,
    id: string,
    key: string,
    route: string,
    input: unknown,
    action: (
      m: EntityManager,
      b: BoardRow,
      scope: Awaited<ReturnType<WhiteboardAccessService['session']>>,
    ) => Promise<T>,
  ): Promise<T> {
    this.enabled();
    return this.db.transaction(async (m) => {
      const { b, scope } = await this.load(m, actor, id);
      if (!scope.mentor) boardError(403, 'BOARD_ACCESS_DENIED');
      return this.receipt(m, actor, key, `${route}/${id}`, input, () => action(m, b, scope));
    });
  }
  private async receipt<T>(
    m: EntityManager,
    actor: AuthenticatedUser,
    key: string,
    route: string,
    input: unknown,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!isUUID(key, '4')) boardError(422, 'BOARD_IDEMPOTENCY_KEY_REQUIRED');
    await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `${actor.userId}/${key}`,
    ]);
    const digest = hash(JSON.stringify(input));
    const rows: { route: string; request_hash: string; response: T }[] = await m.query(
      'SELECT route,request_hash,response FROM whiteboard_receipts WHERE actor_id=$1 AND key=$2',
      [actor.userId, key],
    );
    const existing = rows[0];
    if (existing) {
      if (existing.route !== route || existing.request_hash !== digest)
        boardError(409, 'BOARD_IDEMPOTENCY_CONFLICT');
      return existing.response;
    }
    const result = await action();
    await m.query(
      'INSERT INTO whiteboard_receipts(actor_id,key,route,request_hash,response) VALUES($1,$2,$3,$4,$5)',
      [actor.userId, key, route, digest, JSON.stringify(result)],
    );
    return result;
  }
  private async saveSnapshot(m: EntityManager, b: BoardRow, reason: string, actorId: string) {
    const rows: { id: string; epoch: string; sequence: string; reason: string; createdAt: Date }[] =
      await m.query(
        `INSERT INTO whiteboard_snapshots(board_id,epoch,sequence,control_version,reason,checkpoint,projection,checksum,created_by,schema_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,epoch,sequence,reason,created_at AS "createdAt"`,
        [
          b.id,
          b.epoch,
          b.sequence,
          b.control_version,
          reason,
          b.checkpoint,
          JSON.stringify(b.projection),
          hash(b.checkpoint),
          actorId,
          b.schema_version,
        ],
      );
    const s = rows[0];
    if (!s) boardError(503, 'BOARD_UNAVAILABLE');
    return s;
  }
}
