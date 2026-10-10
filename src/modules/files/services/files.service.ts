import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { CreateUploadIntentDto } from '../dtos/create-upload-intent.dto.js';
import type { FileStatusDto, UploadIntentDto } from '../dtos/file-status.dto.js';
import { FileMetadataEntity } from '../entities/file-metadata.entity.js';
import { FileObjectEntity } from '../entities/file-object.entity.js';
import { FileProcessingJobEntity } from '../entities/file-processing-job.entity.js';
import { FileException } from '../exceptions/file.exceptions.js';
import { FILE_STORAGE, type FileStorage, type FileSummary } from '../files.contracts.js';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { FileUploadPolicyService } from './file-upload-policy.service.js';

@Injectable()
export class FilesService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly policy: FileUploadPolicyService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}
  private enabled(): void {
    if (!this.config.getOrThrow<boolean>('MINIO_ENABLED'))
      throw new FileException('FILE_STORAGE_DISABLED', HttpStatus.SERVICE_UNAVAILABLE);
  }
  async createIntent(
    principal: AuthenticatedUser,
    input: CreateUploadIntentDto,
  ): Promise<UploadIntentDto> {
    const declaration = {
      filename: input.originalFilename,
      mimeType: input.declaredMimeType,
      sizeBytes: input.declaredSizeBytes,
    };
    await this.policy.authorizeUpload(principal, input, declaration);
    this.enabled();
    try {
      await this.storage.assertAvailable();
    } catch {
      throw new FileException('FILE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const file = await this.db.transaction(async (manager) => {
      // Serialize quotas per actor across replicas. Scope changes use Classes' public lock.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `file-intents:${principal.userId}`,
      ]);
      const scope = await this.policy.authorizeUpload(principal, input, declaration, manager);
      const repository = manager.getRepository(FileObjectEntity);
      const openCount = await repository
        .createQueryBuilder('file')
        .where('file.owner_user_id = :owner', { owner: principal.userId })
        .andWhere("file.status IN ('PENDING_UPLOAD','PROCESSING')")
        .andWhere("(file.status = 'PROCESSING' OR file.intent_expires_at > now())")
        .getCount();
      if (openCount >= this.config.getOrThrow<number>('FILE_MAX_OPEN_INTENTS'))
        throw new FileException('FILE_UPLOAD_QUOTA_EXCEEDED', HttpStatus.TOO_MANY_REQUESTS);
      const now = new Date();
      const id = randomUUID();
      return repository.save(
        repository.create({
          id,
          ownerUserId: principal.userId,
          courseUnitId: scope.courseUnitId,
          intentClassId: scope.classContext?.classId ?? null,
          intentClassUnitId: scope.classContext?.classUnitId ?? null,
          bucket: this.config.getOrThrow<string>('MINIO_BUCKET'),
          stagingKey: `staging/${id}/${randomUUID()}`,
          originalName: input.originalFilename,
          extension: extname(input.originalFilename).toLowerCase(),
          declaredMimeType: input.declaredMimeType,
          declaredSizeBytes: String(input.declaredSizeBytes),
          status: 'PENDING_UPLOAD',
          intentExpiresAt: new Date(
            now.getTime() + this.config.getOrThrow<number>('FILE_INTENT_TTL_SECONDS') * 1000,
          ),
        }),
      );
    });
    try {
      const ttl = this.config.getOrThrow<number>('FILE_PUT_TTL_SECONDS');
      const issued = new Date();
      const uploadUrl = await this.storage.presignPut(
        file.bucket,
        file.stagingKey,
        file.declaredMimeType,
        ttl,
      );
      return {
        fileId: file.id,
        uploadUrl,
        requiredHeaders: { 'content-type': file.declaredMimeType },
        uploadUrlExpiresAt: new Date(issued.getTime() + ttl * 1000).toISOString(),
        intentExpiresAt: file.intentExpiresAt.toISOString(),
      };
    } catch {
      await this.db
        .getRepository(FileObjectEntity)
        .update(
          { id: file.id, status: 'PENDING_UPLOAD' },
          { status: 'FAILED', errorCode: 'FILE_STORAGE_UNAVAILABLE' },
        );
      throw new FileException('FILE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
  async detail(principal: AuthenticatedUser, id: string): Promise<FileStatusDto> {
    const file = await this.load(this.db.manager, id);
    await this.authorize(principal, file);
    this.enabled();
    return this.status(file, this.db.manager);
  }
  async complete(
    principal: AuthenticatedUser,
    id: string,
  ): Promise<{ readonly httpStatus: 200 | 202; readonly file: FileStatusDto }> {
    return this.db.transaction(async (manager) => {
      const file = await this.load(manager, id, true);
      await this.authorize(principal, file, manager);
      this.enabled();
      if (file.status === 'READY')
        return { httpStatus: 200, file: await this.status(file, manager) };
      if (file.status === 'PROCESSING')
        return { httpStatus: 202, file: await this.status(file, manager) };
      if (file.status === 'FAILED' || file.status === 'DELETED')
        throw new FileException(
          file.errorCode === 'UPLOAD_EXPIRED'
            ? 'UPLOAD_EXPIRED'
            : file.status === 'DELETED'
              ? 'FILE_DELETED'
              : 'UPLOAD_FAILED',
        );
      const now = new Date();
      if (now >= file.intentExpiresAt) throw new FileException('UPLOAD_EXPIRED');
      file.status = 'PROCESSING';
      file.processingAt = now;
      await manager.getRepository(FileObjectEntity).save(file);
      await manager.getRepository(FileProcessingJobEntity).insert({
        fileObjectId: id,
        kind: 'VALIDATE',
        status: 'PENDING',
        maxAttempts: this.config.getOrThrow<number>('FILE_JOB_MAX_ATTEMPTS'),
        availableAt: now,
      });
      return { httpStatus: 202, file: await this.status(file, manager) };
    });
  }
  async assertReadyReference(
    principal: AuthenticatedUser,
    id: string,
    courseUnitId: string,
    manager: EntityManager,
  ): Promise<FileSummary> {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('File reference requires an active transaction');
    const file = await this.load(manager, id, true);
    await this.authorize(principal, file, manager);
    if (file.courseUnitId !== courseUnitId)
      throw new FileException('MATERIAL_SCOPE_MISMATCH', HttpStatus.UNPROCESSABLE_ENTITY);
    if (
      file.status !== 'READY' ||
      !file.mimeType ||
      !file.kind ||
      !file.sizeBytes ||
      !file.objectKey ||
      !file.objectVersionId
    )
      throw new FileException('FILE_NOT_READY');
    return {
      id,
      ownerUserId: file.ownerUserId,
      courseUnitId,
      status: 'READY',
      originalFilename: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      kind: file.kind,
    };
  }
  private async authorize(
    principal: AuthenticatedUser,
    file: FileObjectEntity,
    manager?: EntityManager,
  ): Promise<void> {
    if (principal.role !== UserRole.MANAGER && file.ownerUserId !== principal.userId)
      throw new FileException('MATERIAL_ACCESS_DENIED', HttpStatus.FORBIDDEN);
    // Manager can take over a Mentor intent without inheriting its former Class assignment.
    const scope =
      principal.role === UserRole.MANAGER
        ? { courseUnitId: file.courseUnitId }
        : {
            courseUnitId: file.courseUnitId,
            classId: file.intentClassId ?? undefined,
            classUnitId: file.intentClassUnitId ?? undefined,
          };
    await this.policy.authorizeUpload(
      principal,
      scope,
      {
        filename: file.originalName,
        mimeType: file.declaredMimeType,
        sizeBytes: Number(file.declaredSizeBytes),
      },
      manager,
    );
  }
  private async load(manager: EntityManager, id: string, lock = false): Promise<FileObjectEntity> {
    const query = manager
      .getRepository(FileObjectEntity)
      .createQueryBuilder('file')
      .where('file.id = :id', { id });
    if (lock) query.setLock('pessimistic_write');
    const file = await query.getOne();
    if (file === null) throw new FileException('FILE_NOT_FOUND', HttpStatus.NOT_FOUND);
    return file;
  }
  private async status(file: FileObjectEntity, manager: EntityManager): Promise<FileStatusDto> {
    const metadata = await manager
      .getRepository(FileMetadataEntity)
      .findOneBy({ fileObjectId: file.id });
    return {
      id: file.id,
      status: file.status,
      originalFilename: file.originalName,
      courseUnitId: file.courseUnitId,
      declaredSizeBytes: Number(file.declaredSizeBytes),
      sizeBytes: file.sizeBytes === null ? null : Number(file.sizeBytes),
      mimeType: file.mimeType,
      kind: file.kind,
      intentExpiresAt: file.intentExpiresAt.toISOString(),
      readyAt: file.readyAt?.toISOString() ?? null,
      metadataStatus: metadata?.processingStatus ?? null,
      errorCode: file.errorCode,
    };
  }
}
