import { type EntityManager, In } from 'typeorm';
import type { FileSummary } from '../../files/files.contracts.js';
import type { FilesService } from '../../files/services/files.service.js';
import type { MaterialFileReference, MaterialSnapshot } from '../domain/material-contract.js';
import type { MaterialEntity } from '../entities/material.entity.js';
import {
  MaterialFileReferenceEntity,
  MaterialReferenceRole,
} from '../entities/material-file-reference.entity.js';

export interface ResolvedMaterial {
  material: MaterialEntity;
  snapshot: MaterialSnapshot;
  file: FileSummary | null;
  inlineImages: FileSummary[];
  attachments: FileSummary[];
}

/** One reference query and one file query for a whole page. */
export async function resolveMaterials(
  manager: EntityManager,
  files: FilesService,
  materials: readonly MaterialEntity[],
): Promise<ResolvedMaterial[]> {
  if (!materials.length) return [];
  const refs = await manager.getRepository(MaterialFileReferenceEntity).find({
    where: { materialId: In(materials.map((m) => m.id)) },
    order: { fileId: 'ASC', role: 'ASC' },
  });
  const summaries = await files.readSummaries(
    [
      ...materials.flatMap((m) => (m.fileObjectId ? [m.fileObjectId] : [])),
      ...refs.map((ref) => ref.fileId),
    ],
    manager,
  );
  return materials.map((material) => {
    const ownRefs = refs.filter((ref) => ref.materialId === material.id);
    const reference = (id: string): MaterialFileReference =>
      summaries.get(id) ?? {
        id,
        ownerUserId: '',
        courseUnitId: material.courseUnitId,
        status: 'FAILED',
      };
    const byRole = (role: MaterialFileReferenceEntity['role']): FileSummary[] =>
      ownRefs
        .filter((ref) => ref.role === role)
        .flatMap((ref) => {
          const summary = summaries.get(ref.fileId);
          return summary && summary.courseUnitId === material.courseUnitId ? [summary] : [];
        });
    const file = material.fileObjectId ? (summaries.get(material.fileObjectId) ?? null) : null;
    return {
      material,
      file: file?.courseUnitId === material.courseUnitId ? file : null,
      inlineImages: byRole(MaterialReferenceRole.INLINE_IMAGE),
      attachments: byRole(MaterialReferenceRole.ATTACHMENT),
      snapshot: {
        ...material,
        file: material.fileObjectId ? reference(material.fileObjectId) : null,
        inlineImages: ownRefs
          .filter((ref) => ref.role === 'INLINE_IMAGE')
          .map((ref) => reference(ref.fileId)),
        attachments: ownRefs
          .filter((ref) => ref.role === 'ATTACHMENT')
          .map((ref) => reference(ref.fileId)),
      },
    };
  });
}
