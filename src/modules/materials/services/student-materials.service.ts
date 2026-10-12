import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor tokens.
import { DataSource, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import type { ClassContentContext } from '../../classes/domain/class-content-context.js';
import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { ClassUnitNotFoundException } from '../../classes/exceptions/class.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor tokens.
import { ClassContentContextService } from '../../classes/services/class-content-context.service.js';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor tokens.
import { FilesService } from '../../files/services/files.service.js';
import { canReadMaterial, isMaterialUnitReleased } from '../domain/material-access.js';
import type { MaterialReadContext } from '../domain/material-contract.js';
import type { StudentMaterialView } from '../dtos/student-material.dto.js';
import { StudentMaterialDownloadDto } from '../dtos/student-material.dto.js';
import { MaterialEntity } from '../entities/material.entity.js';
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
      if (!isMaterialUnitReleased(context, now)) return { items: [], total: 0, asOf: now };
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

  async download(
    principal: AuthenticatedUser,
    classId: string,
    materialId: string,
  ): Promise<StudentMaterialDownloadDto> {
    const view = await this.detail(principal, classId, materialId);
    // Signing is outside the read transaction. Never sign staging/latest versions or arbitrary fileIds.
    const signed = await this.files.signReadReference(view.file.id, view.material.courseUnitId);
    const current = await this.detail(principal, classId, materialId);
    if (current.material.revision !== view.material.revision || current.file.id !== view.file.id)
      throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
    return new StudentMaterialDownloadDto(materialId, view.file.id, signed.url, signed.expiresAt);
  }

  private visibleQuery(manager: EntityManager, now: Date): SelectQueryBuilder<MaterialEntity> {
    const files = this.files.readyReadProjection(manager);
    return manager
      .getRepository(MaterialEntity)
      .createQueryBuilder('material')
      .innerJoin(
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
        "((material.contentType = 'VIDEO' AND ready_file.kind = 'VIDEO') OR (material.contentType = 'FILE' AND ready_file.kind <> 'VIDEO'))",
      );
  }

  private async views(
    materials: readonly MaterialEntity[],
    read: MaterialReadContext,
    manager: EntityManager,
  ): Promise<StudentMaterialView[]> {
    const summaries = await this.files.readSummaries(
      materials.map((material) => material.fileObjectId),
      manager,
    );
    return materials.flatMap((material) => {
      const file = summaries.get(material.fileObjectId);
      if (!file || !canReadMaterial({ ...material, file }, read)) return [];
      return [
        {
          material,
          file,
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
