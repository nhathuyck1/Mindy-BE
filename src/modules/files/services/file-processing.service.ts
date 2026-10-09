import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor.
import { DataSource, type EntityManager } from 'typeorm';
import { FileMetadataEntity } from '../entities/file-metadata.entity.js';
import { FileObjectEntity } from '../entities/file-object.entity.js';
import { FileProcessingJobEntity } from '../entities/file-processing-job.entity.js';
import { BinaryValidationError } from '../exceptions/file.exceptions.js';
import { FILE_STORAGE, type FileStorage } from '../files.contracts.js';
import { BINARY_VALIDATOR, type BinaryValidator } from './binary-validation.service.js';
export interface FileJobClaim {
  readonly id: string;
  readonly token: string;
  readonly fileId: string;
}
class LeaseLostError extends Error {}

@Injectable()
export class FileProcessingService {
  private readonly logger = new Logger(FileProcessingService.name);
  private readonly active = new Set<AbortController>();
  stop(): void {
    for (const controller of this.active) controller.abort();
  }
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(BINARY_VALIDATOR) private readonly validator: BinaryValidator,
  ) {}
  async expireIntents(): Promise<void> {
    await this.db.query(
      `UPDATE file_objects SET status='FAILED',error_code='UPLOAD_EXPIRED',updated_at=now() WHERE status='PENDING_UPLOAD' AND intent_expires_at <= now()`,
    );
  }
  async claim(): Promise<FileJobClaim | null> {
    return this.db.transaction(async (manager) => {
      const job = await manager
        .getRepository(FileProcessingJobEntity)
        .createQueryBuilder('job')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where("job.kind = 'VALIDATE'")
        .andWhere(
          "((job.status = 'PENDING' AND job.available_at <= now()) OR (job.status = 'PROCESSING' AND job.lease_until <= now()))",
        )
        .orderBy('job.available_at', 'ASC')
        .addOrderBy('job.id', 'ASC')
        .getOne();
      if (job === null) return null;
      if (job.attempts >= job.maxAttempts) {
        job.status = 'FAILED';
        job.errorCode = 'FILE_RETRY_EXHAUSTED';
        job.leaseToken = null;
        job.leaseUntil = null;
        job.completedAt = new Date();
        await manager
          .getRepository(FileObjectEntity)
          .update(
            { id: job.fileObjectId, status: 'PROCESSING' },
            { status: 'FAILED', errorCode: job.errorCode },
          );
        await manager.getRepository(FileProcessingJobEntity).save(job);
        return null;
      }
      job.attempts++;
      job.status = 'PROCESSING';
      job.leaseToken = randomUUID();
      const times = (await manager.query('SELECT clock_timestamp() AS now')) as { now: Date }[];
      const now = times[0]?.now;
      job.leaseUntil = new Date(
        (now ?? new Date()).getTime() +
          this.config.getOrThrow<number>('FILE_JOB_LEASE_SECONDS') * 1000,
      );
      await manager.getRepository(FileProcessingJobEntity).save(job);
      return { id: job.id, token: job.leaseToken, fileId: job.fileObjectId };
    });
  }
  async heartbeat(claim: FileJobClaim): Promise<boolean> {
    const result = await this.db
      .createQueryBuilder()
      .update(FileProcessingJobEntity)
      .set({
        leaseUntil: () =>
          `clock_timestamp() + interval '${this.config.getOrThrow<number>('FILE_JOB_LEASE_SECONDS')} seconds'`,
      })
      .where(
        'id = :id AND lease_token = :token AND status = :status AND lease_until > clock_timestamp()',
        { id: claim.id, token: claim.token, status: 'PROCESSING' },
      )
      .execute();
    return result.affected === 1;
  }
  private async owned(
    manager: EntityManager,
    claim: FileJobClaim,
  ): Promise<FileProcessingJobEntity> {
    const job = await manager
      .getRepository(FileProcessingJobEntity)
      .createQueryBuilder('job')
      .setLock('pessimistic_write')
      .where(
        'job.id = :id AND job.lease_token = :token AND job.status = :status AND job.lease_until > clock_timestamp()',
        { id: claim.id, token: claim.token, status: 'PROCESSING' },
      )
      .getOne();
    if (!job) throw new LeaseLostError();
    return job;
  }
  async process(claim: FileJobClaim): Promise<void> {
    const controller = new AbortController();
    this.active.add(controller);
    let scratch: string | undefined;
    const heartbeat = setInterval(() => {
      void this.heartbeat(claim)
        .then((owned) => {
          if (!owned) controller.abort();
        })
        .catch(() => controller.abort());
    }, this.config.getOrThrow<number>('FILE_JOB_HEARTBEAT_SECONDS') * 1000);
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.getOrThrow<number>('FILE_JOB_TIMEOUT_SECONDS') * 1000,
    );
    heartbeat.unref();
    timeout.unref();
    try {
      const file = await this.db
        .getRepository(FileObjectEntity)
        .findOneByOrFail({ id: claim.fileId });
      if (file.status !== 'PROCESSING') throw new LeaseLostError();
      await this.storage.assertAvailable();
      if (!file.stagingVersionId) {
        const source = await this.storage.head(file.bucket, file.stagingKey);
        await this.db.transaction(async (manager) => {
          await this.owned(manager, claim);
          const repository = manager.getRepository(FileObjectEntity);
          const current = await repository.findOne({
            where: { id: file.id, status: 'PROCESSING' },
            lock: { mode: 'pessimistic_write' },
          });
          if (!current) throw new LeaseLostError();
          if (!current.stagingVersionId) {
            current.stagingVersionId = source.versionId;
            await repository.save(current);
          }
          file.stagingVersionId = current.stagingVersionId;
        });
      }
      const sourceVersion = file.stagingVersionId;
      if (!sourceVersion) throw new LeaseLostError();
      const source = await this.storage.head(file.bucket, file.stagingKey, sourceVersion);
      const expected = Number(file.declaredSizeBytes);
      if (source.size !== expected || source.size <= 0 || source.size > 209715200)
        throw new BinaryValidationError('FILE_SIZE_MISMATCH');
      const key = `final/${file.id}/${claim.token}`;
      await this.db.transaction(async (manager) => {
        const job = await this.owned(manager, claim);
        if (!job.copyCandidates.some((candidate) => candidate.token === claim.token)) {
          job.copyCandidates = [
            ...job.copyCandidates,
            { token: claim.token, key, versionId: null },
          ];
          await manager.getRepository(FileProcessingJobEntity).save(job);
        }
      });
      const versionId = await this.storage.copy(
        { bucket: file.bucket, key: file.stagingKey, versionId: sourceVersion },
        key,
        controller.signal,
      );
      await this.db.transaction(async (manager) => {
        const job = await this.owned(manager, claim);
        job.copyCandidates = job.copyCandidates.map((candidate) =>
          candidate.token === claim.token ? { ...candidate, versionId } : candidate,
        );
        await manager.getRepository(FileProcessingJobEntity).save(job);
      });
      const root = resolve(this.config.getOrThrow<string>('FILE_SCRATCH_DIRECTORY'));
      await mkdir(root, { recursive: true });
      scratch = await mkdtemp(join(root, 'validate-'));
      const path = join(scratch, 'payload');
      const hash = createHash('sha256');
      let bytes = 0;
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > expected) callback(new BinaryValidationError('FILE_SIZE_MISMATCH'));
          else {
            hash.update(chunk);
            callback(null, chunk);
          }
        },
      });
      const stream = await this.storage.read(
        { bucket: file.bucket, key, versionId },
        controller.signal,
      );
      await pipeline(stream, counter, createWriteStream(path, { flags: 'wx', mode: 0o600 }), {
        signal: controller.signal,
      });
      if (bytes !== expected) throw new BinaryValidationError('FILE_SIZE_MISMATCH');
      const verified = await this.validator.validate(
        path,
        { filename: file.originalName, mimeType: file.declaredMimeType, sizeBytes: bytes },
        controller.signal,
      );
      const sha256 = hash.digest('hex');
      await this.db.transaction(async (manager) => {
        const job = await this.owned(manager, claim);
        const repository = manager.getRepository(FileObjectEntity);
        const current = await repository.findOne({
          where: { id: file.id, status: 'PROCESSING' },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current) throw new LeaseLostError();
        current.status = 'READY';
        current.objectKey = key;
        current.objectVersionId = versionId;
        current.sha256 = sha256;
        current.mimeType = verified.mimeType;
        current.kind = verified.kind;
        current.sizeBytes = String(bytes);
        current.readyAt = new Date();
        current.errorCode = null;
        await repository.save(current);
        await manager
          .getRepository(FileMetadataEntity)
          .insert({ fileObjectId: file.id, processingStatus: 'PENDING', properties: {} });
        await manager.getRepository(FileProcessingJobEntity).insert({
          fileObjectId: file.id,
          kind: 'EXTRACT',
          status: 'PENDING',
          maxAttempts: this.config.getOrThrow<number>('FILE_JOB_MAX_ATTEMPTS'),
          availableAt: new Date(),
        });
        job.status = 'SUCCEEDED';
        job.leaseToken = null;
        job.leaseUntil = null;
        job.errorCode = null;
        job.completedAt = new Date();
        await manager.getRepository(FileProcessingJobEntity).save(job);
      });
      this.logger.log({ event: 'FILE_READY', fileId: claim.fileId, jobId: claim.id });
    } catch (error: unknown) {
      if (!(error instanceof LeaseLostError))
        await this.fail(claim, error).catch(() => {
          this.logger.warn({
            event: 'FILE_LEASE_RECOVERY_REQUIRED',
            fileId: claim.fileId,
            jobId: claim.id,
          });
        });
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      controller.abort();
      this.active.delete(controller);
      if (scratch) await rm(scratch, { recursive: true, force: true });
    }
  }
  private async fail(claim: FileJobClaim, error: unknown): Promise<void> {
    await this.db.transaction(async (manager) => {
      const job = await this.owned(manager, claim);
      const permanent = error instanceof BinaryValidationError;
      const terminal = permanent || job.attempts >= job.maxAttempts;
      job.errorCode = permanent
        ? error.code
        : terminal
          ? 'FILE_RETRY_EXHAUSTED'
          : 'FILE_STORAGE_UNAVAILABLE';
      job.status = terminal ? 'FAILED' : 'PENDING';
      job.leaseUntil = null;
      job.leaseToken = null;
      job.availableAt = new Date(
        Date.now() + Math.min(60000, 1000 * 2 ** job.attempts) + Math.floor(Math.random() * 1000),
      );
      job.completedAt = terminal ? new Date() : null;
      if (terminal)
        await manager
          .getRepository(FileObjectEntity)
          .update(
            { id: claim.fileId, status: 'PROCESSING' },
            { status: 'FAILED', errorCode: job.errorCode },
          );
      await manager.getRepository(FileProcessingJobEntity).save(job);
      this.logger.warn({
        event: terminal ? 'FILE_FAILED' : 'FILE_RETRY',
        fileId: claim.fileId,
        jobId: claim.id,
        errorCode: job.errorCode,
        attempt: job.attempts,
      });
    });
  }
}
