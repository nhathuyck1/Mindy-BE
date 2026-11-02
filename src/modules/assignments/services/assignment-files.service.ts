import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { BinaryValidationError } from '../../files/exceptions/file.exceptions.js';
import { FILE_STORAGE, type FileStorage } from '../../files/files.contracts.js';
import {
  BINARY_VALIDATOR,
  type BinaryValidator,
} from '../../files/services/binary-validation.service.js';
import { UserRole } from '../../users/user-role.enum.js';
import type {
  AssignmentUploadInput,
  InstructionUploadInput,
  ZipVersionInput,
} from '../dtos/zip-input.dto.js';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';
import { ZipValidationError } from '../validation/zip-validation.js';
import type { AssignmentFileJob, AssignmentFileRow } from '../zip.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentFileValidator } from './assignment-file-validator.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ZipAccessService } from './zip-access.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ZipReceiptsService } from './zip-receipts.service.js';

export interface AssignmentFileStatus {
  id: string;
  status: AssignmentFileRow['status'];
  version: number;
  purpose: AssignmentFileRow['purpose'];
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  errorCode: string | null;
}
const instructionMimes: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};
@Injectable()
export class AssignmentFilesService implements OnApplicationShutdown {
  private readonly active = new Set<AbortController>();
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly access: ZipAccessService,
    private readonly receipts: ZipReceiptsService,
    private readonly zipValidator: AssignmentFileValidator,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(BINARY_VALIDATOR) private readonly validator: BinaryValidator,
  ) {}
  onApplicationShutdown(): void {
    for (const controller of this.active) controller.abort();
  }
  private enabled(): void {
    this.access.enabled();
    if (!this.config.get<boolean>('MINIO_ENABLED', false))
      throw new AssignmentException(503, 'ASSIGNMENT_STORAGE_UNAVAILABLE');
  }
  private declaration(
    input: { originalFilename: string; declaredMimeType: string; declaredSizeBytes: number },
    instruction: boolean,
  ): void {
    const name = input.originalFilename;
    const allowed = instruction
      ? instructionMimes[input.declaredMimeType]
      : input.declaredMimeType === 'application/zip'
        ? ['.zip']
        : undefined;
    if (
      !allowed?.includes(extname(name).toLowerCase()) ||
      !name.trim() ||
      /[\\/]/.test(name) ||
      [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
      name.length > 250 ||
      !Number.isSafeInteger(input.declaredSizeBytes) ||
      input.declaredSizeBytes < 1 ||
      input.declaredSizeBytes > (instruction ? 25 : 20) * 1024 * 1024
    )
      throw new AssignmentException(422, 'INVALID_ASSIGNMENT_FILE');
  }
  async intent(
    actor: AuthenticatedUser,
    id: string,
    input: InstructionUploadInput | AssignmentUploadInput,
    instruction: boolean,
    key?: string,
  ) {
    const receiptKey = this.receipts.key(key);
    this.enabled();
    this.declaration(input, instruction);
    try {
      await this.storage.assertAvailable();
    } catch {
      throw new AssignmentException(503, 'ASSIGNMENT_STORAGE_UNAVAILABLE');
    }
    const result = await this.db.transaction(async (m) => {
      let assignmentId: string,
        submissionId: string | null = null;
      if (instruction) {
        const a = await this.access.assignment(m, actor, id, true);
        if (actor.role !== UserRole.MENTOR || a.status !== 'DRAFT')
          throw new AssignmentException(409, 'ASSIGNMENT_CONTENT_FROZEN');
        assignmentId = a.id;
        if (!('expectedRevision' in input) || a.revision !== input.expectedRevision)
          throw new AssignmentException(409, 'ASSIGNMENT_VERSION_CONFLICT');
      } else {
        const s = await this.access.submission(m, actor, id, true);
        if (s.status !== 'DRAFT')
          throw new AssignmentException(409, 'SUBMISSION_ALREADY_SUBMITTED');
        if (!('expectedVersion' in input) || input.expectedVersion !== s.version)
          throw new AssignmentException(409, 'SUBMISSION_VERSION_CONFLICT');
        assignmentId = s.assignment_id;
        submissionId = s.id;
      }
      const route = `upload:${instruction ? 'instruction' : 'submission'}:${id.toLowerCase()}`;
      const previous = await this.receipts.replay<{ fileId: string }>(
        m,
        actor.userId,
        route,
        receiptKey,
        input,
      );
      if (previous) return this.load(m, previous.fileId);
      const counts: { open: number; hour: number; assignment: number }[] = await m.query(
        `SELECT
        count(*) FILTER(WHERE owner_user_id=$1 AND status IN ('PENDING_UPLOAD','PROCESSING') AND intent_expires_at>clock_timestamp())::int AS open,
        count(*) FILTER(WHERE owner_user_id=$1 AND created_at>clock_timestamp()-interval '1 hour')::int AS hour,
        count(*) FILTER(WHERE assignment_id=$2 AND status IN ('PENDING_UPLOAD','PROCESSING') AND intent_expires_at>clock_timestamp())::int AS assignment
        FROM assignment_files WHERE owner_user_id=$1 OR assignment_id=$2`,
        [actor.userId, assignmentId],
      );
      if (
        (counts[0]?.open ?? 0) >= 10 ||
        (counts[0]?.hour ?? 0) >= 50 ||
        (counts[0]?.assignment ?? 0) >= 500
      )
        throw new AssignmentException(429, 'ASSIGNMENT_UPLOAD_LIMIT_REACHED');
      const fileId = randomUUID();
      await m.query(
        `INSERT INTO assignment_files(id,assignment_id,owner_user_id,zip_submission_id,purpose,original_name,declared_mime_type,declared_size_bytes,bucket,staging_key,intent_expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()+interval '15 minutes')`,
        [
          fileId,
          assignmentId,
          actor.userId,
          submissionId,
          instruction ? 'INSTRUCTION' : 'SUBMISSION',
          input.originalFilename,
          input.declaredMimeType,
          input.declaredSizeBytes,
          this.config.getOrThrow<string>('MINIO_BUCKET'),
          `assignment-staging/${fileId}/${randomUUID()}`,
        ],
      );
      await this.receipts.save(m, actor.userId, route, receiptKey, input, { fileId });
      return this.load(m, fileId);
    });
    await this.db.transaction((m) => this.assertMutable(m, actor, result, true));
    if (result.status !== 'PENDING_UPLOAD' || result.intent_expires_at.getTime() <= Date.now())
      throw new AssignmentException(409, 'ASSIGNMENT_UPLOAD_EXPIRED');
    const ttl = Math.max(
      1,
      Math.min(300, Math.floor((result.intent_expires_at.getTime() - Date.now()) / 1000)),
    );
    let uploadUrl: string;
    try {
      uploadUrl = await this.storage.presignPut(
        result.bucket,
        result.staging_key,
        result.declared_mime_type,
        ttl,
      );
    } catch {
      throw new AssignmentException(503, 'ASSIGNMENT_STORAGE_UNAVAILABLE');
    }
    await this.db.transaction((m) => this.assertMutable(m, actor, result, true));
    return {
      ...this.project(result),
      fileId: result.id,
      uploadUrl,
      requiredHeaders: { 'content-type': result.declared_mime_type },
      uploadUrlExpiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      intentExpiresAt: result.intent_expires_at.toISOString(),
    };
  }
  async complete(
    actor: AuthenticatedUser,
    id: string,
    input: ZipVersionInput,
    key?: string,
  ): Promise<AssignmentFileStatus> {
    const receiptKey = this.receipts.key(key);
    this.enabled();
    const initial = await this.load(this.db.manager, id);
    await this.db.transaction((m) => this.assertMutable(m, actor, initial, true));
    let version: string | null = initial.staging_version_id;
    if (initial.status === 'PENDING_UPLOAD') {
      try {
        const head = await this.storage.head(initial.bucket, initial.staging_key);
        if (head.size !== initial.declared_size_bytes)
          throw new AssignmentException(422, 'ASSIGNMENT_FILE_SIZE_MISMATCH');
        version = head.versionId;
      } catch (e) {
        if (e instanceof AssignmentException) throw e;
        throw new AssignmentException(503, 'ASSIGNMENT_STORAGE_UNAVAILABLE');
      }
    }
    return this.db.transaction(async (m) => {
      await this.assertMutable(m, actor, initial, true);
      const route = `complete:${initial.id}`;
      const replay = await this.receipts.replay<AssignmentFileStatus>(
        m,
        actor.userId,
        route,
        receiptKey,
        input,
      );
      if (replay) return replay;
      const file = await this.load(m, id, true);
      if (file.version !== input.expectedVersion)
        throw new AssignmentException(409, 'SUBMISSION_VERSION_CONFLICT');
      if (
        file.status !== 'PENDING_UPLOAD' ||
        !version ||
        file.intent_expires_at.getTime() <= Date.now()
      )
        throw new AssignmentException(409, 'ASSIGNMENT_UPLOAD_EXPIRED');
      await m.query(
        "UPDATE assignment_files SET status='PROCESSING',version=version+1,staging_version_id=$2 WHERE id=$1",
        [file.id, version],
      );
      await m.query("INSERT INTO assignment_file_jobs(file_id,kind) VALUES($1,'VALIDATE')", [
        file.id,
      ]);
      const outcome = this.project({ ...file, status: 'PROCESSING', version: file.version + 1 });
      await this.receipts.save(m, actor.userId, route, receiptKey, input, outcome);
      return outcome;
    });
  }
  async status(actor: AuthenticatedUser, id: string): Promise<AssignmentFileStatus> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const file = await this.load(m, id);
      await this.readable(m, actor, file, false);
      return this.project(file);
    });
  }
  async download(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const file = await this.load(this.db.manager, id);
    await this.readable(this.db.manager, actor, file, true);
    if (file.status !== 'READY' || !file.object_key || !file.object_version_id)
      throw new AssignmentException(409, 'FILE_NOT_READY');
    let url: string;
    try {
      url = await this.storage.presignGet(
        { bucket: file.bucket, key: file.object_key, versionId: file.object_version_id },
        file.original_name,
        60,
        'attachment',
      );
    } catch {
      throw new AssignmentException(503, 'ASSIGNMENT_STORAGE_UNAVAILABLE');
    }
    await this.readable(this.db.manager, actor, await this.load(this.db.manager, id), true);
    return { url, expiresAt: new Date(Date.now() + 60000).toISOString() };
  }
  private async readable(
    m: EntityManager,
    actor: AuthenticatedUser,
    f: AssignmentFileRow,
    download: boolean,
  ): Promise<void> {
    if (f.purpose === 'SUBMISSION' && f.zip_submission_id) {
      const s = await this.access.submission(m, actor, f.zip_submission_id);
      if (s.status === 'DRAFT' && f.owner_user_id === actor.userId) return;
      const bound = await m.query(
        'SELECT 1 FROM assignment_zip_submission_files WHERE submission_id=$1 AND file_id=$2 AND object_version_id=$3',
        [s.id, f.id, f.object_version_id],
      );
      if (!bound.length) throw new AssignmentException(404, 'FILE_SCOPE_MISMATCH');
      return;
    }
    if (actor.role === UserRole.STUDENT) {
      // Old instruction files are readable only through an own submitted snapshot.
      const history = await m.query(
        `SELECT s.id FROM assignment_zip_instruction_snapshots b JOIN assignment_zip_submissions s ON s.id=b.submission_id
        WHERE b.file_id=$1 AND b.object_version_id=$2 AND s.student_id=$3 AND s.status='SUBMITTED' LIMIT 1`,
        [f.id, f.object_version_id, actor.userId],
      );
      const quizHistory = await m.query(
        `SELECT 1 FROM assignment_submissions q JOIN assignment_instruction_files b ON b.assignment_id=q.assignment_id
        WHERE q.student_id=$1 AND q.status='GRADED' AND b.file_id=$2 LIMIT 1`,
        [actor.userId, f.id],
      );
      if (quizHistory.length) {
        // actor() remains required after source/enrollment archival; own graded paper is the only grant.
        await this.access.actor(m, actor);
        return;
      }
      if (history.length) {
        await this.access.submission(m, actor, history[0].id);
        return;
      }
    }
    await this.access.assignment(m, actor, f.assignment_id);
    if (actor.role === UserRole.MENTOR && (!download || f.owner_user_id === actor.userId)) return;
    const binding = await m.query(
      'SELECT 1 FROM assignment_instruction_files WHERE assignment_id=$1 AND file_id=$2',
      [f.assignment_id, f.id],
    );
    if (!binding.length) throw new AssignmentException(404, 'FILE_SCOPE_MISMATCH');
  }
  private async assertMutable(
    m: EntityManager,
    actor: AuthenticatedUser,
    f: AssignmentFileRow,
    lock = false,
  ): Promise<void> {
    this.enabled();
    if (f.owner_user_id !== actor.userId) throw new AssignmentException(404, 'FILE_SCOPE_MISMATCH');
    if (f.purpose === 'SUBMISSION' && f.zip_submission_id) {
      // Always use work() so even a non-locking presign recheck enforces DB deadline/account/enrollment.
      const s = await this.access.submission(m, actor, f.zip_submission_id, lock);
      await this.access.work(m, actor, f.assignment_id);
      if (s.status !== 'DRAFT') throw new AssignmentException(409, 'SUBMISSION_ALREADY_SUBMITTED');
    } else {
      const a = await this.access.assignment(m, actor, f.assignment_id, lock);
      if (actor.role !== UserRole.MENTOR || a.status !== 'DRAFT')
        throw new AssignmentException(409, 'ASSIGNMENT_CONTENT_FROZEN');
    }
  }
  async load(m: EntityManager, id: string, lock = false): Promise<AssignmentFileRow> {
    const rows: AssignmentFileRow[] = await m.query(
      `SELECT * FROM assignment_files WHERE id=$1${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!rows[0]) throw new AssignmentException(404, 'ASSIGNMENT_FILE_NOT_FOUND');
    return rows[0];
  }
  private project(f: AssignmentFileRow): AssignmentFileStatus {
    return {
      id: f.id,
      status: f.status,
      version: f.version,
      purpose: f.purpose,
      originalFilename: f.original_name,
      mimeType: f.declared_mime_type,
      sizeBytes: f.declared_size_bytes,
      errorCode: f.error_code,
    };
  }
  async claim(): Promise<AssignmentFileJob | null> {
    const rows: AssignmentFileJob[] = await this.db.query(
      `WITH chosen AS (SELECT id FROM assignment_file_jobs
      WHERE ((status='PENDING' AND run_after<=clock_timestamp()) OR (status='RUNNING' AND lease_until<clock_timestamp())) AND attempts<5
      AND (kind='CLEANUP' OR $1) ORDER BY run_after,id FOR UPDATE SKIP LOCKED LIMIT 1)
      , updated AS (UPDATE assignment_file_jobs j SET status='RUNNING',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '180 seconds'
      FROM chosen WHERE j.id=chosen.id RETURNING j.*) SELECT * FROM updated`,
      [this.config.get<boolean>('ASSIGNMENT_ZIP_ENABLED', false)],
    );
    return rows[0] ?? null;
  }
  private async lease(m: EntityManager, job: AssignmentFileJob): Promise<boolean> {
    return (
      (
        await m.query(
          "SELECT id FROM assignment_file_jobs WHERE id=$1 AND lease_token=$2 AND status='RUNNING' AND lease_until>clock_timestamp() FOR UPDATE",
          [job.id, job.lease_token],
        )
      ).length > 0
    );
  }
  async process(job: AssignmentFileJob): Promise<void> {
    if (!(await this.db.transaction((m) => this.lease(m, job)))) return;
    const controller = new AbortController();
    this.active.add(controller);
    const timer = setTimeout(() => controller.abort(), 90000);
    timer.unref();
    const heartbeat = setInterval(() => {
      void this.db
        .query(
          "UPDATE assignment_file_jobs SET lease_until=clock_timestamp()+interval '180 seconds' WHERE id=$1 AND lease_token=$2 AND status='RUNNING'",
          [job.id, job.lease_token],
        )
        .catch(() => controller.abort());
    }, 15000);
    heartbeat.unref();
    let scratch: string | undefined;
    try {
      if (job.kind === 'CLEANUP') {
        await this.cleanup(job);
      } else {
        const file = await this.load(this.db.manager, job.file_id);
        if (file.status !== 'PROCESSING' || !file.staging_version_id) {
          await this.finish(job);
          return;
        }
        const actor: AuthenticatedUser = {
          userId: file.owner_user_id,
          role: file.purpose === 'SUBMISSION' ? UserRole.STUDENT : UserRole.MENTOR,
          sessionId: job.id,
        };
        await this.db.transaction((m) => this.assertMutable(m, actor, file, true));
        const head = await this.storage.head(
          file.bucket,
          file.staging_key,
          file.staging_version_id,
        );
        if (head.size !== file.declared_size_bytes)
          throw new BinaryValidationError('FILE_SIZE_MISMATCH');
        const root = resolve(this.config.getOrThrow<string>('FILE_SCRATCH_DIRECTORY'));
        await mkdir(root, { recursive: true });
        scratch = await mkdtemp(join(root, 'assignment-validate-'));
        const path = join(scratch, 'payload');
        let bytes = 0;
        const counter = new Transform({
          transform(chunk: Buffer, _encoding, done) {
            bytes += chunk.length;
            done(
              bytes > file.declared_size_bytes
                ? new BinaryValidationError('FILE_SIZE_MISMATCH')
                : null,
              chunk,
            );
          },
        });
        await pipeline(
          await this.storage.read(
            { bucket: file.bucket, key: file.staging_key, versionId: file.staging_version_id },
            controller.signal,
          ),
          counter,
          createWriteStream(path, { flags: 'wx', mode: 0o600 }),
          { signal: controller.signal },
        );
        if (bytes !== file.declared_size_bytes)
          throw new BinaryValidationError('FILE_SIZE_MISMATCH');
        if (file.purpose === 'SUBMISSION') await this.zipValidator.zip(path, controller.signal);
        else {
          const verified = await this.validator.validate(
            path,
            { filename: file.original_name, mimeType: file.declared_mime_type, sizeBytes: bytes },
            controller.signal,
          );
          if (
            verified.mimeType !== file.declared_mime_type ||
            !['PDF', 'IMAGE', 'DOCUMENT'].includes(verified.kind)
          )
            throw new BinaryValidationError();
        }
        const key = `assignment-verified/${file.id}/${job.lease_token}`;
        await this.db.query(
          'INSERT INTO assignment_file_copies(file_id,token,object_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [file.id, job.lease_token, key],
        );
        const version = await this.storage.copy(
          { bucket: file.bucket, key: file.staging_key, versionId: file.staging_version_id },
          key,
          controller.signal,
        );
        await this.db.transaction(async (m) => {
          await this.assertMutable(m, actor, file, true);
          const current = await this.load(m, file.id, true);
          if (!(await this.lease(m, job))) return;
          if (
            current.status === 'PROCESSING' &&
            current.staging_version_id === file.staging_version_id
          )
            await m.query(
              `UPDATE assignment_files SET status='READY',version=version+1,object_key=$2,object_version_id=$3,mime_type=declared_mime_type,size_bytes=declared_size_bytes,ready_at=clock_timestamp(),error_code=NULL WHERE id=$1`,
              [file.id, key, version],
            );
          await m.query(
            "UPDATE assignment_file_jobs SET status='DONE',lease_until=NULL WHERE id=$1 AND lease_token=$2",
            [job.id, job.lease_token],
          );
        });
      }
    } catch (error) {
      const terminal =
        error instanceof ZipValidationError ||
        error instanceof BinaryValidationError ||
        error instanceof AssignmentException;
      const code =
        error instanceof ZipValidationError
          ? error.code
          : error instanceof AssignmentException
            ? 'FILE_ACCESS_REVOKED'
            : error instanceof BinaryValidationError
              ? 'ASSIGNMENT_FILE_INVALID'
              : 'ASSIGNMENT_STORAGE_UNAVAILABLE';
      await this.db.transaction(async (m) => {
        const file = await this.load(m, job.file_id, true);
        if (!(await this.lease(m, job))) return;
        const exhausted = terminal || job.attempts >= 5;
        if (exhausted && file.status === 'PROCESSING')
          await m.query(
            "UPDATE assignment_files SET status='FAILED',version=version+1,error_code=$2 WHERE id=$1",
            [file.id, code],
          );
        await m.query(
          `UPDATE assignment_file_jobs SET status=$3,error_code=$4,lease_until=NULL,run_after=clock_timestamp()+interval '10 seconds' WHERE id=$1 AND lease_token=$2`,
          [job.id, job.lease_token, exhausted ? 'FAILED' : 'PENDING', code],
        );
      });
    } finally {
      clearTimeout(timer);
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
  private async finish(job: AssignmentFileJob): Promise<void> {
    await this.db.query(
      "UPDATE assignment_file_jobs SET status='DONE',lease_until=NULL,run_after=clock_timestamp()+interval '1 day' WHERE id=$1 AND lease_token=$2",
      [job.id, job.lease_token],
    );
  }
  private async referenced(m: EntityManager, id: string): Promise<boolean> {
    const rows = await m.query(
      `SELECT 1 FROM assignment_instruction_files WHERE file_id=$1 UNION ALL
      SELECT 1 FROM assignment_zip_instruction_snapshots WHERE file_id=$1 UNION ALL
      SELECT 1 FROM assignment_zip_submission_files b JOIN assignment_zip_submissions s ON s.id=b.submission_id WHERE b.file_id=$1 AND s.status IN ('DRAFT','SUBMITTED') LIMIT 1`,
      [id],
    );
    return rows.length > 0;
  }
  private async cleanup(job: AssignmentFileJob): Promise<void> {
    const file = await this.db.transaction(async (m) => {
      const f = await this.load(m, job.file_id, true);
      const old: { eligible: boolean }[] = await m.query(
        "SELECT intent_expires_at<clock_timestamp() AND created_at<clock_timestamp()-$2*interval '1 hour' AS eligible FROM assignment_files WHERE id=$1",
        [f.id, this.config.get<number>('ASSIGNMENT_FILE_CLEANUP_GRACE_HOURS', 24)],
      );
      if (!(await this.lease(m, job)) || !old[0]?.eligible || (await this.referenced(m, f.id)))
        return null;
      await m.query("UPDATE assignment_files SET status='DELETING',version=version+1 WHERE id=$1", [
        f.id,
      ]);
      return f;
    });
    if (file) {
      if (!this.storage.deleteAllVersions)
        throw new Error('Assignment storage cleanup unavailable');
      await this.storage.deleteAllVersions(file.bucket, file.staging_key);
      const copies: { object_key: string }[] = await this.db.query(
        'SELECT object_key FROM assignment_file_copies WHERE file_id=$1',
        [file.id],
      );
      for (const copy of copies) await this.storage.deleteAllVersions(file.bucket, copy.object_key);
      await this.db.query(
        "UPDATE assignment_files SET status='DELETED',version=version+1 WHERE id=$1 AND status='DELETING'",
        [file.id],
      );
    }
    await this.finish(job);
  }
  async maintenance(): Promise<void> {
    // Bounded recovery for a worker dying on its final lease (claim excludes attempts >=5).
    await this.db.query(`WITH dead AS (UPDATE assignment_file_jobs SET status='FAILED',error_code='JOB_ATTEMPTS_EXHAUSTED'
      WHERE status='RUNNING' AND lease_until<clock_timestamp() AND attempts>=5 RETURNING file_id,kind)
      UPDATE assignment_files f SET status='FAILED',version=version+1,error_code='JOB_ATTEMPTS_EXHAUSTED'
      FROM dead WHERE f.id=dead.file_id AND f.status='PROCESSING' AND dead.kind='VALIDATE'`);
    await this.voidClosedDrafts();
    const grace = this.config.get<number>('ASSIGNMENT_FILE_CLEANUP_GRACE_HOURS', 24);
    await this.db.query(
      `INSERT INTO assignment_file_jobs(file_id,kind)
      SELECT f.id,'CLEANUP' FROM assignment_files f WHERE f.created_at<clock_timestamp()-$1*interval '1 hour'
      AND f.intent_expires_at<clock_timestamp() AND f.status IN ('READY','FAILED','PENDING_UPLOAD','DELETING','DELETED')
      AND NOT EXISTS(SELECT 1 FROM assignment_file_jobs j WHERE j.file_id=f.id AND j.kind='CLEANUP'
        AND (j.status IN ('PENDING','RUNNING','FAILED') OR j.run_after>clock_timestamp()))
      AND NOT EXISTS(SELECT 1 FROM assignment_instruction_files b WHERE b.file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM assignment_zip_instruction_snapshots b WHERE b.file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM assignment_zip_submission_files b JOIN assignment_zip_submissions s ON s.id=b.submission_id WHERE b.file_id=f.id AND s.status IN ('DRAFT','SUBMITTED'))
      ORDER BY f.created_at LIMIT 50 ON CONFLICT(file_id,kind) DO UPDATE SET status='PENDING',attempts=0,run_after=clock_timestamp()
      WHERE assignment_file_jobs.status='DONE'`,
      [grace],
    );
  }
  private async voidClosedDrafts(): Promise<void> {
    const rows: { id: string; assignment_id: string; student_id: string }[] =
      await this.db.query(`SELECT z.id,z.assignment_id,z.student_id FROM assignment_zip_submissions z
      JOIN assignments a ON a.id=z.assignment_id JOIN class_sessions s ON s.id=a.session_id JOIN classes c ON c.id=s.class_id JOIN enrollments e ON e.id=z.enrollment_id JOIN users u ON u.id=z.student_id
      WHERE z.status='DRAFT' AND (a.status<>'PUBLISHED' OR s.status='CANCELLED' OR c.status IN ('CANCELLED','COMPLETED') OR e.status<>'ACTIVE' OR u.status<>'ACTIVE' OR u.role<>'STUDENT') ORDER BY z.id LIMIT 50`);
    for (const row of rows)
      await this.db.transaction(async (m) => {
        const actor: AuthenticatedUser = {
          userId: row.student_id,
          role: UserRole.STUDENT,
          sessionId: row.id,
        };
        // Normal writers take actor -> class -> session -> assignment -> enrollment -> submission.
        // Invalid actors need explicit row locks to decide against concurrent reactivation.
        const a: { session_id: string }[] = await m.query(
          'SELECT session_id FROM assignments WHERE id=$1',
          [row.assignment_id],
        );
        if (!a[0]) return;
        await m.query('SELECT id FROM users WHERE id=$1 FOR SHARE', [actor.userId]);
        await m.query(
          'SELECT c.id FROM classes c JOIN class_sessions s ON s.class_id=c.id WHERE s.id=$1 FOR SHARE OF c',
          [a[0].session_id],
        );
        await m.query('SELECT id FROM class_sessions WHERE id=$1 FOR SHARE', [a[0].session_id]);
        await m.query('SELECT id FROM assignments WHERE id=$1 FOR UPDATE', [row.assignment_id]);
        await m.query(
          'SELECT e.id FROM enrollments e JOIN assignment_zip_submissions z ON z.enrollment_id=e.id WHERE z.id=$1 FOR SHARE OF e',
          [row.id],
        );
        await m.query(
          `WITH voided AS (UPDATE assignment_zip_submissions z SET status='VOIDED',version=z.version+1,updated_at=clock_timestamp()
        FROM assignments a,class_sessions s,classes c,enrollments e,users u
        WHERE z.id=$1 AND z.status='DRAFT' AND a.id=z.assignment_id AND s.id=a.session_id AND c.id=s.class_id AND e.id=z.enrollment_id AND u.id=z.student_id
        AND (a.status<>'PUBLISHED' OR s.status='CANCELLED' OR c.status IN ('CANCELLED','COMPLETED') OR e.status<>'ACTIVE' OR u.status<>'ACTIVE' OR u.role<>'STUDENT') RETURNING z.*)
        INSERT INTO assignment_zip_audits(assignment_id,submission_id,action,version) SELECT assignment_id,id,'VOID',version FROM voided`,
          [row.id],
        );
      });
  }
}
