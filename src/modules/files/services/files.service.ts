import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { DataSource, type EntityManager, In } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { CreateUploadIntentDto } from '../dtos/create-upload-intent.dto.js';
import type { FileStatusDto, UploadIntentDto } from '../dtos/file-status.dto.js';
import { FileMetadataEntity } from '../entities/file-metadata.entity.js';
import { FileObjectEntity } from '../entities/file-object.entity.js';
import { FileProcessingJobEntity } from '../entities/file-processing-job.entity.js';
import { FileException } from '../exceptions/file.exceptions.js';
import {
  type ContentDisposition,
  FILE_STORAGE,
  type FileStorage,
  type FileSummary,
} from '../files.contracts.js';
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
  /** Public read projection: Materials filters READY references before count/pagination. */
  readyReadProjection(manager: EntityManager): {
    readonly query: string;
    readonly parameters: Record<string, unknown>;
  } {
    const query = manager
      .getRepository(FileObjectEntity)
      .createQueryBuilder('read_file')
      .select('read_file.id', 'id')
      .addSelect('read_file.courseUnitId', 'course_unit_id')
      .addSelect('read_file.kind', 'kind')
      .where("read_file.status = 'READY'")
      .andWhere('read_file.deletedAt IS NULL');
    return { query: query.getQuery(), parameters: query.getParameters() };
  }

  /** Metadata only; caller owns Material visibility. Upload ownership is not a read entitlement. */
  async readSummaries(
    ids: readonly string[],
    manager: EntityManager,
    includeUnavailable = false,
  ): Promise<Map<string, FileSummary>> {
    if (ids.length === 0) return new Map();
    const files = await manager
      .getRepository(FileObjectEntity)
      .findBy({ id: In([...ids]), ...(includeUnavailable ? {} : { status: 'READY' as const }) });
    return new Map(
      files.flatMap((file): [string, FileSummary][] => {
        if (
          (!includeUnavailable && file.deletedAt !== null) ||
          file.mimeType === null ||
          file.sizeBytes === null ||
          file.kind === null
        )
          return [];
        return [
          [
            file.id,
            {
              id: file.id,
              ownerUserId: file.ownerUserId,
              courseUnitId: file.courseUnitId,
              status: file.deletedAt === null ? file.status : 'DELETED',
              originalFilename: file.originalName,
              mimeType: file.mimeType,
              sizeBytes: Number(file.sizeBytes),
              kind: file.kind,
            },
          ],
        ];
      }),
    );
  }

  /** Internal capability: only call after the owning feature authorizes the current Material. */
  async signReadReference(
    id: string,
    courseUnitId: string,
    disposition: ContentDisposition = 'inline',
  ): Promise<{
    readonly url: string;
    readonly expiresAt: Date;
  }> {
    const file = await this.load(this.db.manager, id);
    if (
      file.courseUnitId !== courseUnitId ||
      file.status !== 'READY' ||
      file.deletedAt !== null ||
      !file.objectKey ||
      !file.objectVersionId
    )
      throw new FileException('FILE_NOT_READY');
    this.enabled();
    const ttl = this.config.getOrThrow<number>('FILE_GET_TTL_SECONDS');
    const issuedAt = new Date();
    try {
      const url = await this.storage.presignGet(
        { bucket: file.bucket, key: file.objectKey, versionId: file.objectVersionId },
        file.originalName,
        ttl,
        disposition,
      );
      return { url, expiresAt: new Date(issuedAt.getTime() + ttl * 1000) };
    } catch {
      throw new FileException('FILE_STORAGE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE);
    }
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
  /** Lock the union of old/new references before authorizing any Class context. */
  async assertReadyReferences(
    principal: AuthenticatedUser,
    ids: readonly string[],
    courseUnitId: string,
    manager: EntityManager,
    previousIds: readonly string[] = [],
    contextClassIds: readonly string[] = [],
  ): Promise<Map<string, FileSummary>> {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('File references require an active transaction');
    const union = [...new Set([...ids, ...previousIds])].sort();
    const rows =
      union.length === 0
        ? []
        : await manager
            .getRepository(FileObjectEntity)
            .createQueryBuilder('file')
            .where('file.id IN (:...ids)', { ids: union })
            .orderBy('file.id', 'ASC')
            .setLock('pessimistic_write')
            .getMany();
    // authorize() may lock Classes. Every file row is already locked at this point.
    const selected = new Map(rows.map((row) => [row.id, row]));
    await this.policy.lockReferenceContext(
      principal,
      [
        ...contextClassIds,
        ...rows.flatMap((row) => (row.intentClassId ? [row.intentClassId] : [])),
      ],
      manager,
    );
    const result = new Map<string, FileSummary>();
    const ordered = [...new Set(ids)].sort((a, b) => {
      const left = selected.get(a)?.intentClassId ?? '';
      const right = selected.get(b)?.intentClassId ?? '';
      return left.localeCompare(right) || a.localeCompare(b);
    });
    for (const id of ordered) {
      const file = selected.get(id);
      if (!file) throw new FileException('FILE_NOT_FOUND', HttpStatus.NOT_FOUND);
      await this.authorize(principal, file, manager);
      if (file.courseUnitId !== courseUnitId)
        throw new FileException('MATERIAL_SCOPE_MISMATCH', HttpStatus.UNPROCESSABLE_ENTITY);
      if (
        file.status !== 'READY' ||
        file.deletedAt !== null ||
        !file.mimeType ||
        !file.kind ||
        !file.sizeBytes ||
        !file.objectKey ||
        !file.objectVersionId
      )
        throw new FileException('FILE_NOT_READY');
      result.set(id, {
        id,
        ownerUserId: file.ownerUserId,
        courseUnitId,
        status: 'READY',
        originalFilename: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: Number(file.sizeBytes),
        kind: file.kind,
      });
    }
    return result;
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
