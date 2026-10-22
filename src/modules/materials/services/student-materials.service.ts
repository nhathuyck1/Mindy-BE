import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor tokens.
import { DataSource, type EntityManager, In, type SelectQueryBuilder } from 'typeorm';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import type { ClassContentContext } from '../../classes/domain/class-content-context.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { ClassUnitNotFoundException } from '../../classes/exceptions/class.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor tokens.
import { ClassContentContextService } from '../../classes/services/class-content-context.service.js';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor tokens.
import { FilesService } from '../../files/services/files.service.js';
import { canReadMaterial } from '../domain/material-access.js';
import type { MaterialReadContext } from '../domain/material-contract.js';
import { findMaterialFileRole, materialFileDisposition } from '../domain/material-file-access.js';
import { MaterialFileAccessDto } from '../dtos/material-file-access.dto.js';
import type { StudentMaterialView } from '../dtos/student-material.dto.js';
import { StudentMaterialDownloadDto } from '../dtos/student-material.dto.js';
import { MaterialEntity } from '../entities/material.entity.js';
import {
  MaterialFileReferenceEntity,
  MaterialReferenceRole,
} from '../entities/material-file-reference.entity.js';
import { MaterialPolicyException } from '../exceptions/material.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor tokens.
import { MaterialPolicyService } from './material-policy.service.js';

@Injectable()
export class StudentMaterialsService {
  constructor(
    private readonly db: DataSource,
    private readonly contexts: ClassContentContextService,
    private readonly policy: MaterialPolicyService,
    private readonly files: FilesService,
  ) {}

  async list(
    principal: AuthenticatedUser,
    classId: string,
    classUnitId: string,
    options: PageOptionsDto,
  ): Promise<{
    readonly items: StudentMaterialView[];
    readonly total: number;
    readonly asOf: Date;
  }> {
    return this.snapshot(async (manager) => {
      await this.policy.assertStudentClassAccess(principal, classId, manager);
      const context = await this.contexts.getUnit(classUnitId, classId, manager);
      const now = new Date();
      if (context.classStatus === ClassStatus.CANCELLED)
        throw new MaterialPolicyException('MATERIAL_ACCESS_DENIED');
      const read = await this.policy.studentReadContext(principal, context, now, manager);
      const [materials, total] = await this.visibleQuery(manager, now)
        .andWhere('material.courseUnitId = :courseUnitId', { courseUnitId: context.courseUnitId })
        .orderBy('material.sortOrder', 'ASC')
        .addOrderBy('material.id', 'ASC')
        .skip((options.page - 1) * options.pageSize)
        .take(options.pageSize)
        .getManyAndCount();
      const items = await this.views(materials, read, manager);
      return { items, total, asOf: now };
    });
  }

  async detail(
    principal: AuthenticatedUser,
    classId: string,
    materialId: string,
  ): Promise<StudentMaterialView> {
    return this.snapshot(async (manager) => {
      await this.policy.assertStudentClassAccess(principal, classId, manager);
      const now = new Date();
      const material = await this.visibleQuery(manager, now)
        .andWhere('material.id = :materialId', { materialId })
        .getOne();
      if (material === null) throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
      let context: ClassContentContext;
      try {
        context = await this.contexts.getCourseUnitInClass(classId, material.courseUnitId, manager);
      } catch (error: unknown) {
        if (error instanceof ClassUnitNotFoundException)
          throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
        throw error;
      }
      if (context.classStatus === ClassStatus.CANCELLED)
        throw new MaterialPolicyException('MATERIAL_ACCESS_DENIED');
      const read = await this.policy.studentReadContext(principal, context, now, manager);
      const [view] = await this.views([material], read, manager);
      if (!view) throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
      return view;
    });
  }

  /** Primary FILE/VIDEO only; ARTICLE has no primary binary and returns MATERIAL_NOT_FOUND. */
  async download(
    principal: AuthenticatedUser,
    classId: string,
    materialId: string,
  ): Promise<StudentMaterialDownloadDto> {
    const view = await this.detail(principal, classId, materialId);
    if (view.file === null) throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
    const access = await this.sign(principal, classId, view, view.file.id);
    return new StudentMaterialDownloadDto(materialId, access.fileId, access.url, access.expiresAt);
  }

  /** Signs a primary, inline image or attachment that belongs to the visible Material. */
  async access(
    principal: AuthenticatedUser,
    classId: string,
    materialId: string,
    fileId: string,
  ): Promise<MaterialFileAccessDto> {
    return this.sign(principal, classId, await this.detail(principal, classId, materialId), fileId);
  }

  async accessAtRevision(
    principal: AuthenticatedUser,
    classId: string,
    materialId: string,
    fileId: string,
    expectedRevision: number,
  ): Promise<MaterialFileAccessDto> {
    const view = await this.detail(principal, classId, materialId);
    if (view.material.revision !== expectedRevision)
      throw new MaterialPolicyException('MATERIAL_REVIEW_CONFLICT');
    if (![...view.inlineImages, ...view.attachments].some((file) => file.id === fileId))
      throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
    return this.sign(principal, classId, view, fileId);
  }

  private async sign(
    principal: AuthenticatedUser,
    classId: string,
    view: StudentMaterialView,
    fileId: string,
  ): Promise<MaterialFileAccessDto> {
    const { material } = view;
    const role = findMaterialFileRole(view, fileId);
    if (role === null) throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
    // Signing is outside the read transaction. Never sign staging/latest versions or arbitrary fileIds.
    const signed = await this.files.signReadReference(
      fileId,
      material.courseUnitId,
      materialFileDisposition(role),
    );
    const current = await this.detail(principal, classId, material.id);
    if (
      current.material.revision !== material.revision ||
      findMaterialFileRole(current, fileId) !== role
    )
      throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
    return new MaterialFileAccessDto(
      material.id,
      fileId,
      role,
      material.revision,
      signed.url,
      signed.expiresAt,
    );
  }

  private visibleQuery(manager: EntityManager, now: Date): SelectQueryBuilder<MaterialEntity> {
    const files = this.files.readyReadProjection(manager);
    // Every reference must still be READY in the same Course Unit (inline refs must be IMAGE)
    // before the row counts toward total/page; the typed predicate re-checks in memory.
    const brokenReference = manager
      .getRepository(MaterialFileReferenceEntity)
      .createQueryBuilder('ref')
      .select('1')
      .leftJoin(
        `(${files.query})`,
        'ref_file',
        'ref_file.id = ref.file_id AND ref_file.course_unit_id = material.course_unit_id',
      )
      .where('ref.material_id = material.id')
      .andWhere(
        "(ref_file.id IS NULL OR (ref.role = 'INLINE_IMAGE' AND ref_file.kind <> 'IMAGE'))",
      );
    return manager
      .getRepository(MaterialEntity)
      .createQueryBuilder('material')
      .leftJoin(
        `(${files.query})`,
        'ready_file',
        'ready_file.id = material.fileObjectId AND ready_file.course_unit_id = material.courseUnitId',
      )
      .setParameters(files.parameters)
      .where('material.deletedAt IS NULL')
      .andWhere("material.reviewStatus = 'APPROVED'")
      .andWhere('material.approvedRevision = material.revision')
      .andWhere('material.reviewedBy IS NOT NULL AND material.firstApprovedAt IS NOT NULL')
      .andWhere(
        'isfinite(material.firstApprovedAt) AND isfinite(material.reviewedAt) AND isfinite(material.publishedAt)',
      )
      .andWhere('material.reviewedAt <= :now AND material.publishedAt <= :now', { now })
      .andWhere(
        '(material.availableAt IS NULL OR (isfinite(material.availableAt) AND material.availableAt <= :now))',
      )
      .andWhere(
        `((material.contentType = 'ARTICLE' AND material.fileObjectId IS NULL
          AND material.contentSchemaVersion = 1 AND length(material.contentHtml) > 0)
        OR (material.contentType = 'VIDEO' AND ready_file.kind = 'VIDEO')
        OR (material.contentType = 'FILE' AND ready_file.kind <> 'VIDEO'))`,
      )
      .andWhere(`NOT EXISTS (${brokenReference.getQuery()})`);
  }

  private async views(
    materials: readonly MaterialEntity[],
    read: MaterialReadContext,
    manager: EntityManager,
  ): Promise<StudentMaterialView[]> {
    const refs =
      materials.length === 0
        ? []
        : await manager.getRepository(MaterialFileReferenceEntity).find({
            where: { materialId: In(materials.map((material) => material.id)) },
            order: { fileId: 'ASC', role: 'ASC' },
          });
    const summaries = await this.files.readSummaries(
      [
        ...materials.flatMap((material) => (material.fileObjectId ? [material.fileObjectId] : [])),
        ...refs.map((ref) => ref.fileId),
      ],
      manager,
    );
    return materials.flatMap((material) => {
      const file = material.fileObjectId ? summaries.get(material.fileObjectId) : undefined;
      const own = refs.filter((ref) => ref.materialId === material.id);
      const resolve = (role: MaterialReferenceRole) =>
        own.filter((ref) => ref.role === role).map((ref) => summaries.get(ref.fileId));
      const inlineImages = resolve(MaterialReferenceRole.INLINE_IMAGE);
      const attachments = resolve(MaterialReferenceRole.ATTACHMENT);
      if (
        (material.fileObjectId !== null && !file) ||
        !isPresent(inlineImages) ||
        !isPresent(attachments)
      )
        return [];
      const content = { ...material, file: file ?? null, inlineImages, attachments };
      if (!canReadMaterial(content, read)) return [];
      return [
        {
          material,
          file: content.file,
          inlineImages,
          attachments,
          classId: read.classContext.classId,
          classUnitId: read.classContext.classUnitId,
        },
      ];
    });
  }

  private snapshot<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      return work(manager);
    });
  }
}

function isPresent<T>(items: readonly (T | undefined)[]): items is readonly T[] {
  return items.every((item) => item !== undefined);
}
