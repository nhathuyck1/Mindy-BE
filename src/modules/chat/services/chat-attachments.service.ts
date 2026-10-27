import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { BinaryValidationError } from '../../files/exceptions/file.exceptions.js';
import { FILE_STORAGE, type FileStorage } from '../../files/files.contracts.js';
import {
  BINARY_VALIDATOR,
  type BinaryValidator,
} from '../../files/services/binary-validation.service.js';
import { ChatException } from '../exceptions/chat.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatAccessService } from './chat-access.service.js';
import type { ChatJob } from './chat-jobs.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatJobsService } from './chat-jobs.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatReceiptService } from './chat-receipt.service.js';

export interface ChatFileDeclaration {
  originalFilename: string;
  declaredMimeType: string;
  declaredSizeBytes: number;
}
interface ChatFileRow {
  id: string;
  conversation_id: string;
  owner_user_id: string;
  original_name: string;
  declared_mime_type: string;
  declared_size_bytes: string;
  bucket: string;
  staging_key: string;
  staging_version_id: string | null;
  object_key: string | null;
  object_version_id: string | null;
  status: string;
  intent_expires_at: Date;
  mime_type: string | null;
  kind: 'IMAGE' | 'PDF' | null;
  size_bytes: string | null;
  ready_at: Date | null;
  error_code: string | null;
}
export interface ChatFileSummary {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'IMAGE' | 'PDF';
}

/** CHAT has an independent owner model. Existing material/assignment routes cannot resolve these IDs. */
@Injectable()
export class ChatAttachmentsService implements OnApplicationShutdown {
  private readonly active = new Set<AbortController>();
  onApplicationShutdown(): void {
    for (const controller of this.active) controller.abort();
  }
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly access: ChatAccessService,
    private readonly jobs: ChatJobsService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(BINARY_VALIDATOR) private readonly validator: BinaryValidator,
    private readonly receipts: ChatReceiptService,
  ) {}
  available(): boolean {
    return (
      this.config.get<boolean>('CHAT_ATTACHMENTS_ENABLED', false) &&
      this.config.get<boolean>('MINIO_ENABLED', false)
    );
  }
  private enabled(): void {
    this.access.enabled();
    if (!this.available()) throw new ChatException(503, 'CHAT_ATTACHMENTS_DISABLED');
  }
  async intent(
    actor: AuthenticatedUser,
    id: string,
    input: ChatFileDeclaration,
    receiptKey: string = randomUUID(),
  ): Promise<{
    fileId: string;
    uploadUrl: string;
    requiredHeaders: Record<string, string>;
    uploadUrlExpiresAt: string;
    intentExpiresAt: string;
    replayed: boolean;
  }> {
    id = id.toLowerCase();
    this.enabled();
    this.declaration(input);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptKey))
      throw new ChatException(422, 'CHAT_INVALID_INPUT');
    await this.access.authorize(this.db.manager, actor, id, true);
    try {
      await this.storage.assertAvailable();
    } catch {
      throw new ChatException(503, 'CHAT_STORAGE_UNAVAILABLE');
    }
    const route = `upload/${id}`,
      request = [
        'upload',
        id,
        input.originalFilename,
        input.declaredMimeType,
        input.declaredSizeBytes,
      ];
    const result = await this.db.transaction(async (m) => {
      await this.access.authorize(m, actor, id, true, true);
      const previous = await this.receipts.lookup(m, actor.userId, route, receiptKey, request);
      if (previous) {
        const file = await this.load(m, id, previous, true);
        if (file.status !== 'PENDING_UPLOAD' || file.intent_expires_at.getTime() <= Date.now())
          throw new ChatException(409, 'CHAT_UPLOAD_CLOSED');
        return { file, replayed: true };
      }
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,6))', [
        `chat-upload/${actor.userId}`,
      ]);
      const count: { count: string }[] = await m.query(
        "SELECT count(*)::text AS count FROM chat_file_objects WHERE owner_user_id=$1 AND status IN ('PENDING_UPLOAD','PROCESSING') AND intent_expires_at>clock_timestamp()",
        [actor.userId],
      );
      if (Number(count[0]?.count ?? 0) >= 10) throw new ChatException(429, 'CHAT_RATE_LIMITED');
      const fileId = randomUUID(),
        key = `chat-staging/${fileId}/${randomUUID()}`;
      await m.query(
        'INSERT INTO chat_file_objects(id,conversation_id,owner_user_id,original_name,declared_mime_type,declared_size_bytes,bucket,staging_key,intent_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          fileId,
          id,
          actor.userId,
          input.originalFilename,
          input.declaredMimeType,
          input.declaredSizeBytes,
          this.config.getOrThrow<string>('MINIO_BUCKET'),
          key,
          new Date(Date.now() + 900000),
        ],
      );
      await this.receipts.insert(m, actor.userId, route, receiptKey, request, fileId);
      return { file: await this.load(m, id, fileId), replayed: false };
    });
    const file = result.file,
      ttl = Math.max(
        1,
        Math.min(300, Math.floor((file.intent_expires_at.getTime() - Date.now()) / 1000)),
      );
    let uploadUrl: string;
    try {
      uploadUrl = await this.storage.presignPut(
        file.bucket,
        file.staging_key,
        file.declared_mime_type,
        ttl,
      );
    } catch {
      throw new ChatException(503, 'CHAT_STORAGE_UNAVAILABLE');
    }
    await this.access.authorize(this.db.manager, actor, id, true);
    return {
      fileId: file.id,
      uploadUrl,
      requiredHeaders: { 'content-type': file.declared_mime_type },
      uploadUrlExpiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      intentExpiresAt: file.intent_expires_at.toISOString(),
      replayed: result.replayed,
    };
  }
  async status(
    actor: AuthenticatedUser,
    id: string,
    fileId: string,
  ): Promise<{
    id: string;
    status: string;
    originalFilename: string;
    errorCode: string | null;
    file: ChatFileSummary | null;
  }> {
    this.enabled();
    await this.access.authorize(this.db.manager, actor, id);
    const row = await this.load(this.db.manager, id, fileId);
    if (row.owner_user_id !== actor.userId) throw new ChatException(404, 'CHAT_NOT_FOUND');
    return {
      id: row.id,
      status: row.status,
      originalFilename: row.original_name,
      errorCode: row.error_code,
      file: row.status === 'READY' ? this.summary(row) : null,
    };
  }
  async complete(
    actor: AuthenticatedUser,
    id: string,
    fileId: string,
  ): Promise<ReturnType<ChatAttachmentsService['status']> extends Promise<infer R> ? R : never> {
    this.enabled();
    await this.access.authorize(this.db.manager, actor, id, true);
    const row = await this.load(this.db.manager, id, fileId);
    if (row.owner_user_id !== actor.userId) throw new ChatException(404, 'CHAT_NOT_FOUND');
    if (['PROCESSING', 'READY'].includes(row.status)) return this.status(actor, id, fileId);
    if (row.status !== 'PENDING_UPLOAD' || row.intent_expires_at.getTime() <= Date.now())
      throw new ChatException(409, 'CHAT_UPLOAD_EXPIRED');
    let version: string;
    try {
      const head = await this.storage.head(row.bucket, row.staging_key);
      if (head.size !== Number(row.declared_size_bytes))
        throw new ChatException(422, 'CHAT_FILE_SIZE_MISMATCH');
      version = head.versionId;
    } catch (e) {
      if (e instanceof ChatException) throw e;
      throw new ChatException(503, 'CHAT_STORAGE_UNAVAILABLE');
    }
    await this.db.transaction(async (m) => {
      await this.access.authorize(m, actor, id, true, true);
      const current = await this.load(m, id, fileId, true);
      if (['PROCESSING', 'READY'].includes(current.status)) return;
      if (current.status !== 'PENDING_UPLOAD' || current.intent_expires_at.getTime() <= Date.now())
        throw new ChatException(409, 'CHAT_UPLOAD_EXPIRED');
      await m.query(
        `UPDATE chat_file_objects SET status='PROCESSING',staging_version_id=$2 WHERE id=$1`,
        [fileId, version],
      );
      await m.query(
        `INSERT INTO chat_jobs(consumer,event_id,conversation_id) VALUES('UPLOAD',$1,$2) ON CONFLICT(event_id,consumer) DO NOTHING`,
        [fileId, id],
      );
    });
    return this.status(actor, id, fileId);
  }
  async assertReady(
    m: EntityManager,
    actor: AuthenticatedUser,
    id: string,
    fileId: string,
    type: 'FILE' | 'IMAGE',
  ): Promise<ChatFileSummary> {
    this.enabled();
    const row = await this.load(m, id, fileId, true);
    if (row.owner_user_id !== actor.userId) throw new ChatException(404, 'CHAT_NOT_FOUND');
    if (row.status !== 'READY') throw new ChatException(409, 'CHAT_FILE_NOT_READY');
    if ((type === 'IMAGE') !== (row.kind === 'IMAGE'))
      throw new ChatException(422, 'CHAT_INVALID_INPUT');
    return this.summary(row);
  }
  async summaryFor(m: EntityManager, id: string, fileId: string): Promise<ChatFileSummary> {
    return this.summary(await this.load(m, id, fileId));
  }
  async sign(
    actor: AuthenticatedUser,
    id: string,
    messageId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    this.enabled();
    const a = await this.access.authorize(this.db.manager, actor, id);
    const rows: { file_object_id: string; sequence: string; deleted_at: Date | null }[] =
      await this.db.query('SELECT * FROM chat_messages WHERE id=$1 AND conversation_id=$2', [
        messageId,
        id,
      ]);
    const message = rows[0];
    if (
      !message ||
      message.deleted_at ||
      !message.file_object_id ||
      BigInt(message.sequence) < BigInt(a.member.visible_from_seq)
    )
      throw new ChatException(404, 'CHAT_NOT_FOUND');
    const file = await this.load(this.db.manager, id, message.file_object_id);
    if (file.status !== 'READY' || !file.object_key || !file.object_version_id)
      throw new ChatException(404, 'CHAT_NOT_FOUND');
    let url: string;
    try {
      url = await this.storage.presignGet(
        { bucket: file.bucket, key: file.object_key, versionId: file.object_version_id },
        file.original_name,
        60,
        'attachment',
      );
    } catch {
      throw new ChatException(503, 'CHAT_STORAGE_UNAVAILABLE');
    }
    await this.access.authorize(this.db.manager, actor, id);
    if (
      !(
        await this.db.query('SELECT 1 FROM chat_messages WHERE id=$1 AND deleted_at IS NULL', [
          messageId,
        ])
      ).length
    )
      throw new ChatException(404, 'CHAT_NOT_FOUND');
    return { url, expiresAt: new Date(Date.now() + 60000).toISOString() };
  }
  async process(job: ChatJob): Promise<void> {
    const id = job.event_id;
    const rows: ChatFileRow[] = await this.db.query('SELECT * FROM chat_file_objects WHERE id=$1', [
      id,
    ]);
    const file = rows[0];
    if (file?.status !== 'PROCESSING' || !file.staging_version_id) return;
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 120000);
    this.active.add(controller);
    const heartbeat = setInterval(() => {
      void this.jobs
        .checkpoint(job, 0)
        .then((ok) => {
          if (!ok) controller.abort();
        })
        .catch(() => controller.abort());
    }, 10000);
    let scratch: string | undefined;
    try {
      const head = await this.storage.head(file.bucket, file.staging_key, file.staging_version_id);
      if (head.size !== Number(file.declared_size_bytes))
        throw new BinaryValidationError('FILE_SIZE_MISMATCH');
      const key = `chat-final/${id}/${job.lease_token}`;
      await this.db.query(
        'INSERT INTO chat_file_copies(file_id,token,object_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [id, job.lease_token, key],
      );
      const version = await this.storage.copy(
        { bucket: file.bucket, key: file.staging_key, versionId: file.staging_version_id },
        key,
        controller.signal,
      );
      await this.db.query(
        'UPDATE chat_file_copies SET version_id=$3 WHERE file_id=$1 AND token=$2',
        [id, job.lease_token, version],
      );
      const root = resolve(this.config.getOrThrow<string>('FILE_SCRATCH_DIRECTORY'));
      await mkdir(root, { recursive: true });
      scratch = await mkdtemp(join(root, 'chat-validate-'));
      const path = join(scratch, 'payload');
      let bytes = 0;
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          bytes += chunk.length;
          done(
            bytes > Number(file.declared_size_bytes)
              ? new BinaryValidationError('FILE_SIZE_MISMATCH')
              : null,
            chunk,
          );
        },
      });
      const source = await this.storage.read(
        { bucket: file.bucket, key, versionId: version },
        controller.signal,
      );
      await pipeline(source, counter, createWriteStream(path, { flags: 'wx', mode: 0o600 }), {
        signal: controller.signal,
      });
      if (bytes !== Number(file.declared_size_bytes))
        throw new BinaryValidationError('FILE_SIZE_MISMATCH');
      const verified = await this.validator.validate(
        path,
        { filename: file.original_name, mimeType: file.declared_mime_type, sizeBytes: bytes },
        controller.signal,
      );
      if (
        !['IMAGE', 'PDF'].includes(verified.kind) ||
        verified.mimeType !== file.declared_mime_type
      )
        throw new BinaryValidationError('FILE_BINARY_INVALID');
      await this.db.transaction(async (m) => {
        const owned = await m.query(
          `SELECT id FROM chat_jobs WHERE id=$1 AND lease_token=$2 AND status='RUNNING'
          AND lease_until>clock_timestamp() FOR UPDATE`,
          [job.id, job.lease_token],
        );
        if (!owned.length) throw new Error('Chat upload lease lost');
        await m.query(
          `UPDATE chat_file_objects SET status='READY',object_key=$2,object_version_id=$3,mime_type=$4,
          kind=$5,size_bytes=$6,ready_at=clock_timestamp(),error_code=NULL WHERE id=$1 AND status='PROCESSING'`,
          [id, key, version, verified.mimeType, verified.kind, bytes],
        );
      });
    } catch (e) {
      if (e instanceof BinaryValidationError) {
        await this.db.query(
          `UPDATE chat_file_objects SET status='FAILED',error_code='CHAT_FILE_INVALID'
          WHERE id=$1 AND status='PROCESSING' AND EXISTS(SELECT 1 FROM chat_jobs WHERE id=$2 AND lease_token=$3 AND lease_until>clock_timestamp())`,
          [id, job.id, job.lease_token],
        );
      } else throw e;
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      controller.abort();
      this.active.delete(controller);
      if (scratch) {
        const root = resolve(this.config.getOrThrow<string>('FILE_SCRATCH_DIRECTORY'));
        if (resolve(scratch).startsWith(root + sep))
          await rm(scratch, { recursive: true, force: true });
      }
    }
  }
  async enqueueCleanup(): Promise<void> {
    await this.db.query(`INSERT INTO chat_jobs(consumer,event_id,conversation_id)
      SELECT 'CLEANUP',f.id,f.conversation_id FROM chat_file_objects f WHERE f.created_at<clock_timestamp()-interval '24 hours'
      AND f.status IN ('READY','FAILED','PENDING_UPLOAD') AND NOT EXISTS(SELECT 1 FROM chat_messages x WHERE x.file_object_id=f.id AND x.deleted_at IS NULL)
      ORDER BY f.created_at LIMIT 100 ON CONFLICT(event_id,consumer) DO UPDATE
      SET status='PENDING',attempts=0,next_attempt_at=clock_timestamp(),completed_at=NULL,last_error_code=NULL
      WHERE chat_jobs.status='DONE'`);
  }
  async cleanup(job: ChatJob): Promise<void> {
    const file = await this.db.transaction(async (m) => {
      const rows: ChatFileRow[] = await m.query(
        'SELECT * FROM chat_file_objects WHERE id=$1 FOR UPDATE',
        [job.event_id],
      );
      const row = rows[0];
      if (!row || row.status === 'DELETED') return null;
      if (
        (
          await m.query(
            'SELECT 1 FROM chat_messages WHERE file_object_id=$1 AND deleted_at IS NULL',
            [row.id],
          )
        ).length
      )
        return null;
      await m.query("UPDATE chat_file_objects SET status='DELETING' WHERE id=$1", [row.id]);
      return row;
    });
    if (!file) return;
    if (!this.storage.deleteVersion) throw new Error('Storage version deletion unavailable');
    const copies: { object_key: string; version_id: string | null }[] = await this.db.query(
      'SELECT * FROM chat_file_copies WHERE file_id=$1',
      [file.id],
    );
    for (const copy of copies)
      if (copy.version_id)
        await this.storage.deleteVersion({
          bucket: file.bucket,
          key: copy.object_key,
          versionId: copy.version_id,
        });
    if (file.staging_version_id)
      await this.storage.deleteVersion({
        bucket: file.bucket,
        key: file.staging_key,
        versionId: file.staging_version_id,
      });
    await this.db.query(
      "UPDATE chat_file_objects SET status='DELETED' WHERE id=$1 AND status='DELETING'",
      [file.id],
    );
  }
  private async load(
    m: EntityManager,
    id: string,
    fileId: string,
    lock = false,
  ): Promise<ChatFileRow> {
    const rows: ChatFileRow[] = await m.query(
      `SELECT * FROM chat_file_objects WHERE id=$1 AND conversation_id=$2${lock ? ' FOR UPDATE' : ''}`,
      [fileId, id],
    );
    const row = rows[0];
    if (!row) throw new ChatException(404, 'CHAT_NOT_FOUND');
    return row;
  }
  private summary(row: ChatFileRow): ChatFileSummary {
    if (!row.kind || !row.mime_type || !row.size_bytes)
      throw new ChatException(409, 'CHAT_FILE_NOT_READY');
    return {
      id: row.id,
      originalFilename: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      kind: row.kind,
    };
  }
  private declaration(input: ChatFileDeclaration): void {
    const rules: Record<string, readonly string[]> = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'application/pdf': ['.pdf'],
    };
    const allowed = rules[input.declaredMimeType],
      limit = input.declaredMimeType === 'application/pdf' ? 10485760 : 5242880;
    if (
      !allowed?.includes(extname(input.originalFilename).toLowerCase()) ||
      !input.originalFilename ||
      input.originalFilename.length > 250 ||
      [...input.originalFilename].some(
        (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === '/' || c === '\\',
      ) ||
      !Number.isSafeInteger(input.declaredSizeBytes) ||
      input.declaredSizeBytes < 1 ||
      input.declaredSizeBytes > limit
    )
      throw new ChatException(422, 'CHAT_INVALID_INPUT');
  }
}
