import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { CoursesService } from '../../catalog/services/courses.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ClassContentContextService } from '../../classes/services/class-content-context.service.js';
import type { FileSummary } from '../../files/files.contracts.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { FilesService } from '../../files/services/files.service.js';
import { UserRole } from '../../users/user-role.enum.js';
import { sanitizeArticle } from '../domain/article-sanitizer.js';
import type {
  MaterialContent,
  MaterialSnapshot,
  MaterialTransition,
} from '../domain/material-contract.js';
import { MaterialPolicyError } from '../domain/material-policy.error.js';
import type {
  CreateManagerMaterialDto,
  ManagerMaterialQueryDto,
  PatchManagerMaterialDto,
} from '../dtos/manager-material-input.dto.js';
import { StudentMaterialFileDto } from '../dtos/student-material.dto.js';
import { MaterialContentType, MaterialEntity } from '../entities/material.entity.js';
import { MaterialAuditEventEntity } from '../entities/material-audit-event.entity.js';
import {
  MaterialFileReferenceEntity,
  MaterialReferenceRole,
} from '../entities/material-file-reference.entity.js';
import { MaterialPolicyException } from '../exceptions/material.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MaterialPolicyService } from './material-policy.service.js';

interface PreparedContent {
  contentHtml: string | null;
  inlineFileIds: string[];
  fileId: string | null;
  attachmentFileIds: string[];
}

@Injectable()
export class ManagerMaterialsService {
  constructor(
    private readonly db: DataSource,
    private readonly policy: MaterialPolicyService,
    private readonly files: FilesService,
    private readonly courses: CoursesService,
    private readonly contexts: ClassContentContextService,
  ) {}

  async create(
    principal: AuthenticatedUser,
    courseUnitId: string,
    input: CreateManagerMaterialDto,
  ) {
    const prepared = this.prepare(input.contentType, input);
    return this.transaction(async (manager) => {
      const summaries = await this.resolve(principal, courseUnitId, prepared, manager);
      await this.authorize(principal, manager, true);
      const content = this.content(input, prepared, summaries);
      await this.lockSession(content.sessionId, courseUnitId, manager);
      const result = await this.policy.createDraft(
        principal,
        randomUUID(),
        { courseUnitId },
        content,
        new Date(),
        manager,
      );
      const saved = await this.persist(result, prepared, manager);
      return this.view(saved, summaries, await this.refs(saved.id, manager), true);
    });
  }

  async patch(principal: AuthenticatedUser, id: string, input: PatchManagerMaterialDto) {
    // Sanitize user HTML before opening the transaction; revalidate the typed snapshot under locks.
    const article = input.contentHtml === undefined ? undefined : this.sanitize(input.contentHtml);
    if (Object.keys(input).filter((key) => key !== 'expectedRevision').length === 0) this.invalid();
    return this.transaction(async (manager) => {
      const material = await this.load(id, manager, true);
      const oldRefs = await this.refs(id, manager);
      const prepared = this.prepare(material.contentType, {
        ...input,
        contentHtml: article?.contentHtml ?? input.contentHtml ?? material.contentHtml ?? undefined,
        fileId: input.fileId ?? material.fileObjectId ?? undefined,
        attachmentFileIds:
          input.attachmentFileIds === undefined
            ? oldRefs
                .filter((ref) => ref.role === MaterialReferenceRole.ATTACHMENT)
                .map((ref) => ref.fileId)
            : input.attachmentFileIds,
        contentSchemaVersion: material.contentSchemaVersion ?? undefined,
      });
      if (material.contentType === MaterialContentType.ARTICLE && input.fileId !== undefined)
        this.invalid();
      if (material.contentType !== MaterialContentType.ARTICLE && input.contentHtml !== undefined)
        this.invalid();
      const summaries = await this.resolve(principal, material.courseUnitId, prepared, manager, [
        ...(material.fileObjectId ? [material.fileObjectId] : []),
        ...oldRefs.map((ref) => ref.fileId),
      ]);
      await this.authorize(principal, manager, true);
      const content = this.content(
        {
          title: material.title,
          description: material.description,
          sortOrder: material.sortOrder,
          availableAt: material.availableAt?.toISOString() ?? null,
          sessionId: material.sessionId,
          ...input,
          contentType: material.contentType,
        },
        prepared,
        summaries,
      );
      await this.lockSession(content.sessionId, material.courseUnitId, manager);
      // All content fields are supplied; every valid PATCH revokes current approval/publication.
      const before = this.snapshot(material, summaries, oldRefs);
      const { contentType: _type, contentSchemaVersion: _version, ...changes } = content;
      const result = await this.policy.applyCommand(
        principal,
        before,
        { action: 'EDIT', expectedRevision: input.expectedRevision, changes },
        new Date(),
        undefined,
        manager,
      );
      const saved = await this.persist(result, prepared, manager);
      return this.view(saved, summaries, await this.refs(id, manager), true);
    });
  }

  async delete(principal: AuthenticatedUser, id: string, expectedRevision: number): Promise<void> {
    await this.transaction(async (manager) => {
      const material = await this.load(id, manager, true, true);
      await this.authorize(principal, manager, true);
      const refs = await this.refs(id, manager);
      const summaries = await this.files.readSummaries(
        [
          ...(material.fileObjectId ? [material.fileObjectId] : []),
          ...refs.map((ref) => ref.fileId),
        ],
        manager,
      );
      const result = await this.policy.applyCommand(
        principal,
        this.snapshot(material, summaries, refs),
        { action: 'DELETE', expectedRevision },
        new Date(),
        undefined,
        manager,
      );
      if (result.audit) {
        await manager
          .getRepository(MaterialEntity)
          .update(id, { deletedAt: result.material.deletedAt, publishedAt: null });
        await manager.getRepository(MaterialAuditEventEntity).insert(result.audit);
      }
    });
  }

  async detail(principal: AuthenticatedUser, id: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      await this.authorize(principal, manager);
      const material = await this.load(id, manager);
      const refs = await this.refs(id, manager);
      const summaries = await this.files.readSummaries(
        [
          ...(material.fileObjectId ? [material.fileObjectId] : []),
          ...refs.map((ref) => ref.fileId),
        ],
        manager,
      );
      return this.view(material, summaries, refs, true);
    });
  }

  async list(
    principal: AuthenticatedUser,
    options: ManagerMaterialQueryDto,
    courseUnitId?: string,
  ) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      await this.authorize(principal, manager);
      const unitId = courseUnitId ?? options.courseUnitId;
      if (unitId && (await this.courses.getUnitContext(unitId, manager)) === null)
        throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
      const query = manager
        .getRepository(MaterialEntity)
        .createQueryBuilder('material')
        .where('material.deletedAt IS NULL');
      if (unitId) query.andWhere('material.courseUnitId = :unitId', { unitId });
      if (options.contentType)
        query.andWhere('material.contentType = :type', { type: options.contentType });
      if (options.reviewStatus)
        query.andWhere('material.reviewStatus = :status', { status: options.reviewStatus });
      const [materials, total] = await query
        .orderBy(
          courseUnitId ? 'material.sortOrder' : 'material.createdAt',
          courseUnitId ? 'ASC' : 'DESC',
        )
        .addOrderBy('material.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      const summaries = await this.files.readSummaries(
        materials.flatMap((material) => (material.fileObjectId ? [material.fileObjectId] : [])),
        manager,
      );
      return {
        items: materials.map((material) => this.view(material, summaries, [], false)),
        page: options.page,
        pageSize: options.pageSize,
        total,
      };
    });
  }

  private async authorize(principal: AuthenticatedUser, manager: EntityManager, lock = false) {
    const actor = await this.policy.actor(principal, manager, lock);
    if (actor.role !== UserRole.MANAGER)
      throw new MaterialPolicyException('MATERIAL_ACCESS_DENIED');
  }

  private async lockSession(
    sessionId: string | null,
    courseUnitId: string,
    manager: EntityManager,
  ) {
    if (!sessionId) return;
    const initial = await this.contexts.getSession(sessionId, undefined, manager);
    await this.contexts.lockContentClass(initial.classId, manager);
    const current = await this.contexts.getSession(sessionId, undefined, manager);
    const unit = await this.courses.getUnitContext(courseUnitId, manager);
    if (current.courseUnitId !== courseUnitId || current.courseId !== unit?.courseId)
      throw new MaterialPolicyException('MATERIAL_SCOPE_MISMATCH');
  }

  private prepare(
    type: MaterialContentType,
    input: Partial<CreateManagerMaterialDto>,
  ): PreparedContent {
    if (!Object.values(MaterialContentType).includes(type)) this.invalid();
    const attachmentFileIds = input.attachmentFileIds ?? [];
    if (
      input.attachmentFileIds === null ||
      !Array.isArray(attachmentFileIds) ||
      attachmentFileIds.length > 50 ||
      attachmentFileIds.some((id) => typeof id !== 'string')
    )
      this.invalid();
    const attachments = attachmentFileIds.map((id) => id.toLowerCase());
    if (new Set(attachments).size !== attachments.length) this.invalid();
    if (type === MaterialContentType.ARTICLE) {
      if (
        input.fileId !== undefined ||
        (input.contentSchemaVersion !== undefined && input.contentSchemaVersion !== 1)
      )
        this.invalid();
      const canonical = this.sanitize(input.contentHtml);
      return { ...canonical, fileId: null, attachmentFileIds: attachments };
    }
    if (
      input.contentHtml !== undefined ||
      input.contentSchemaVersion !== undefined ||
      !input.fileId
    )
      this.invalid();
    const fileId = input.fileId.toLowerCase();
    if (attachments.includes(fileId)) this.invalid();
    return { fileId, contentHtml: null, inlineFileIds: [], attachmentFileIds: attachments };
  }

  private sanitize(html: unknown) {
    if (typeof html !== 'string') this.invalid();
    try {
      return sanitizeArticle(html);
    } catch (error) {
      if (error instanceof MaterialPolicyError) throw new MaterialPolicyException(error.code);
      throw error;
    }
  }

  private resolve(
    principal: AuthenticatedUser,
    unitId: string,
    prepared: PreparedContent,
    manager: EntityManager,
    previous: string[] = [],
  ) {
    return this.files
      .assertReadyReferences(
        principal,
        [
          ...(prepared.fileId ? [prepared.fileId] : []),
          ...prepared.inlineFileIds,
          ...prepared.attachmentFileIds,
        ],
        unitId,
        manager,
        previous,
      )
      .then(async (selected) => {
        const old = await this.files.readSummaries(previous, manager);
        return new Map([...old, ...selected]);
      });
  }

  private content(
    input: CreateManagerMaterialDto,
    prepared: PreparedContent,
    summaries: Map<string, FileSummary>,
  ): MaterialContent {
    if (
      typeof input.title !== 'string' ||
      input.sortOrder === null ||
      (input.description !== undefined &&
        input.description !== null &&
        typeof input.description !== 'string')
    )
      this.invalid();
    return {
      title: input.title.trim(),
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
      availableAt: input.availableAt == null ? null : new Date(input.availableAt),
      sessionId: input.sessionId?.toLowerCase() ?? null,
      contentType: input.contentType,
      contentHtml: prepared.contentHtml,
      contentSchemaVersion: input.contentType === MaterialContentType.ARTICLE ? 1 : null,
      file: prepared.fileId ? (summaries.get(prepared.fileId) ?? null) : null,
      inlineImages: prepared.inlineFileIds.map((id) => this.summary(id, summaries)),
      attachments: prepared.attachmentFileIds.map((id) => this.summary(id, summaries)),
    };
  }

  private snapshot(
    material: MaterialEntity,
    summaries: Map<string, FileSummary>,
    refs: MaterialFileReferenceEntity[],
  ): MaterialSnapshot {
    return {
      ...material,
      file: material.fileObjectId ? (summaries.get(material.fileObjectId) ?? null) : null,
      inlineImages: refs
        .filter((ref) => ref.role === MaterialReferenceRole.INLINE_IMAGE)
        .map((ref) => this.summary(ref.fileId, summaries)),
      attachments: refs
        .filter((ref) => ref.role === MaterialReferenceRole.ATTACHMENT)
        .map((ref) => this.summary(ref.fileId, summaries)),
    };
  }

  private async persist(
    result: MaterialTransition,
    prepared: PreparedContent,
    manager: EntityManager,
  ) {
    const {
      file: _file,
      inlineImages: _inline,
      attachments: _attachments,
      ...state
    } = result.material;
    // Remove old refs before replacing primary (old attachment may become the new primary).
    await manager.getRepository(MaterialFileReferenceEntity).delete({ materialId: state.id });
    const saved = await manager
      .getRepository(MaterialEntity)
      .save({ ...state, fileObjectId: prepared.fileId });
    const refs = [
      ...prepared.inlineFileIds.map((fileId) => ({
        materialId: saved.id,
        fileId,
        role: MaterialReferenceRole.INLINE_IMAGE,
      })),
      ...prepared.attachmentFileIds.map((fileId) => ({
        materialId: saved.id,
        fileId,
        role: MaterialReferenceRole.ATTACHMENT,
      })),
    ];
    if (refs.length) await manager.getRepository(MaterialFileReferenceEntity).insert(refs);
    if (result.audit) await manager.getRepository(MaterialAuditEventEntity).insert(result.audit);
    return saved;
  }

  private async load(id: string, manager: EntityManager, lock = false, deleted = false) {
    const query = manager
      .getRepository(MaterialEntity)
      .createQueryBuilder('material')
      .where('material.id = :id', { id });
    if (lock) query.setLock('pessimistic_write');
    if (!deleted) query.andWhere('material.deletedAt IS NULL');
    const material = await query.getOne();
    if (!material) throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
    return material;
  }

  private refs(id: string, manager: EntityManager) {
    return manager
      .getRepository(MaterialFileReferenceEntity)
      .find({ where: { materialId: id }, order: { fileId: 'ASC', role: 'ASC' } });
  }

  private summary(id: string, summaries: Map<string, FileSummary>) {
    const file = summaries.get(id);
    if (!file) throw new MaterialPolicyException('FILE_NOT_READY');
    return file;
  }

  private view(
    material: MaterialEntity,
    summaries: Map<string, FileSummary>,
    refs: MaterialFileReferenceEntity[],
    detail: boolean,
  ) {
    const file = material.fileObjectId ? summaries.get(material.fileObjectId) : undefined;
    return {
      id: material.id,
      courseUnitId: material.courseUnitId,
      contentType: material.contentType,
      title: material.title,
      description: material.description,
      sortOrder: material.sortOrder,
      availableAt: material.availableAt,
      sessionId: material.sessionId,
      createdBy: material.createdBy,
      createdInClassId: material.createdInClassId,
      revision: material.revision,
      reviewStatus: material.reviewStatus,
      approvedRevision: material.approvedRevision,
      reviewedBy: material.reviewedBy,
      reviewedAt: material.reviewedAt,
      firstApprovedAt: material.firstApprovedAt,
      rejectionReason: material.rejectionReason,
      publishedAt: material.publishedAt,
      createdAt: material.createdAt,
      updatedAt: material.updatedAt,
      canEdit: true,
      file: file ? new StudentMaterialFileDto(file) : null,
      ...(detail
        ? {
            contentHtml: material.contentHtml,
            contentSchemaVersion: material.contentSchemaVersion,
            inlineImages: refs
              .filter((ref) => ref.role === MaterialReferenceRole.INLINE_IMAGE)
              .map((ref) => new StudentMaterialFileDto(this.summary(ref.fileId, summaries))),
            attachments: refs
              .filter((ref) => ref.role === MaterialReferenceRole.ATTACHMENT)
              .map((ref) => new StudentMaterialFileDto(this.summary(ref.fileId, summaries))),
          }
        : {}),
    };
  }

  private invalid(): never {
    throw new MaterialPolicyException('MATERIAL_CONTENT_INVALID');
  }

  private async transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.transaction(work);
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
        if (attempt >= 2 || (code !== '40P01' && code !== '40001')) throw error;
      }
    }
  }
}
