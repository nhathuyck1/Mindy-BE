import { Injectable, UnprocessableEntityException } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
import type {
  MaterialBulkDeleteInput,
  MaterialBulkDeleteResponseDto,
  MaterialCleanupStatsDto,
  MaterialOpenInput,
} from '../dtos/material-retention.dto.js';
import { MaterialEntity } from '../entities/material.entity.js';
import { MaterialPolicyException } from '../exceptions/material.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MaterialAuthoringService } from './material-authoring.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MaterialPolicyService } from './material-policy.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { StudentMaterialsService } from './student-materials.service.js';

@Injectable()
export class MaterialRetentionService {
  async cleanupStats(actor: AuthenticatedUser): Promise<MaterialCleanupStatsDto> {
    await this.policy.actor(actor, this.db.manager);
    if (actor.role !== UserRole.MANAGER)
      throw new MaterialPolicyException('MATERIAL_ACCESS_DENIED');
    const rows: MaterialCleanupStatsDto[] = await this.db.query(`SELECT
      coalesce(sum(coalesce(f.size_bytes,0)) FILTER(WHERE j.status IN ('PENDING','RUNNING') AND NOT EXISTS(SELECT 1 FROM materials m WHERE m.file_object_id=f.id AND m.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM material_file_references r JOIN materials m ON m.id=r.material_id WHERE r.file_id=f.id AND m.deleted_at IS NULL)),0)::text AS "reclaimableBytes",
      coalesce(sum(j.reclaimed_bytes),0)::text AS "reclaimedBytes",count(*) FILTER(WHERE j.status IN ('PENDING','RUNNING'))::int AS "pendingFiles",count(*) FILTER(WHERE j.status='FAILED')::int AS "failedFiles"
      FROM material_file_cleanup_jobs j JOIN file_objects f ON f.id=j.file_id`);
    const row = rows[0];
    if (!row) throw new Error('Cleanup statistics unavailable');
    return row;
  }
  constructor(
    private readonly db: DataSource,
    private readonly policy: MaterialPolicyService,
    private readonly student: StudentMaterialsService,
    private readonly authoring: MaterialAuthoringService,
  ) {}
  async opened(actor: AuthenticatedUser, id: string, input: MaterialOpenInput): Promise<void> {
    const view =
      actor.role === UserRole.STUDENT ? await this.student.detail(actor, input.classId, id) : null;
    if (actor.role !== UserRole.STUDENT && actor.role !== UserRole.MENTOR)
      throw new MaterialPolicyException('MATERIAL_ACCESS_DENIED');
    await this.db.transaction(async (m) => {
      const material = await m
        .getRepository(MaterialEntity)
        .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!material || material.deletedAt) throw new MaterialPolicyException('MATERIAL_NOT_FOUND');
      // Policy recheck under the same material lock that bulk delete takes.
      if (material.revision !== input.expectedRevision)
        throw new MaterialPolicyException('MATERIAL_REVIEW_CONFLICT');
      if (view) {
        if (
          !(await this.policy.canRead(
            actor,
            input.classId,
            {
              ...material,
              file: view.file,
              inlineImages: view.inlineImages,
              attachments: view.attachments,
            },
            new Date(),
            m,
          ))
        )
          throw new MaterialPolicyException('MATERIAL_ACCESS_DENIED');
      } else await this.authoring.assertOpenAccess(actor, material, input.classId, m);
      await m.query(
        `UPDATE materials SET last_seen_at=greatest(date_trunc('milliseconds',clock_timestamp()),coalesce(last_seen_at,tracking_started_at)+interval '1 millisecond'),is_unseen=false WHERE id=$1`,
        [id],
      );
    });
  }
  async bulkDelete(
    actor: AuthenticatedUser,
    input: MaterialBulkDeleteInput,
  ): Promise<MaterialBulkDeleteResponseDto> {
    if (actor.role !== UserRole.MANAGER)
      throw new MaterialPolicyException('MATERIAL_ACCESS_DENIED');
    if (new Set(input.items.map((i) => i.materialId)).size !== input.items.length)
      throw new UnprocessableEntityException('Duplicate material ID');
    if (input.items.some((i) => i.lastSeenAt === undefined))
      throw new UnprocessableEntityException('lastSeenAt snapshot is required');
    const items: MaterialBulkDeleteResponseDto['items'] = [];
    for (const item of input.items) {
      if (item.lastSeenAt === undefined)
        throw new UnprocessableEntityException(
          'lastSeenAt snapshot is required (null for never seen)',
        );
      items.push(
        await this.db.transaction(async (m) => {
          const active = await this.policy.actor(actor, m);
          if (!active.active) throw new MaterialPolicyException('MATERIAL_ACCESS_DENIED');
          const material = await m
            .getRepository(MaterialEntity)
            .findOne({ where: { id: item.materialId }, lock: { mode: 'pessimistic_write' } });
          const status = !material
            ? 'NOT_FOUND'
            : material.deletedAt
              ? 'ALREADY_DELETED'
              : material.revision !== item.expectedRevision ||
                  material.lastSeenAt?.toISOString() !== (item.lastSeenAt ?? undefined) ||
                  material.trackingStartedAt.toISOString() !== item.trackingStartedAt
                ? 'STALE'
                : 'DELETED';
          if (status === 'DELETED' && material) {
            await m.query(
              'UPDATE materials SET deleted_at=clock_timestamp(),published_at=NULL WHERE id=$1',
              [material.id],
            );
            await m.query(
              "INSERT INTO material_audit_events(material_id,actor_id,action,revision,occurred_at) VALUES($1,$2,'DELETE',$3,clock_timestamp())",
              [material.id, actor.userId, material.revision],
            );
          }
          return { materialId: item.materialId, status };
        }),
      );
    }
    return { items };
  }
}
