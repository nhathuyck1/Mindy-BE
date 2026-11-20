import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import { FILE_STORAGE, type FileStorage } from '../files.contracts.js';

interface CleanupJob {
  file_id: string;
  lease_token: string;
  attempts: number;
  manifest: { bucket: string; key: string; done?: boolean }[];
}

/** Storage I/O outside transactions. Marking DELETED fences new material references first. */
@Injectable()
export class MaterialFileCleanupService {
  constructor(
    private readonly db: DataSource,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}
  async runOne(): Promise<boolean> {
    const job = await this.db.transaction(async (m) => {
      const rows: CleanupJob[] = await m.query(
        `SELECT * FROM material_file_cleanup_jobs WHERE (status='PENDING' AND available_at<=clock_timestamp()) OR (status='RUNNING' AND lease_until<=clock_timestamp()) ORDER BY available_at,file_id FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const row = rows[0];
      if (!row) return null;
      if (row.attempts >= 5) {
        await m.query(
          "UPDATE material_file_cleanup_jobs SET status='FAILED',error_code='CLEANUP_RETRY_EXHAUSTED',lease_token=NULL,lease_until=NULL WHERE file_id=$1",
          [row.file_id],
        );
        return null;
      }
      row.lease_token = randomUUID();
      row.attempts += 1;
      await m.query(
        `UPDATE material_file_cleanup_jobs SET status='RUNNING',attempts=$2,lease_token=$3,lease_until=clock_timestamp()+interval '5 minutes' WHERE file_id=$1`,
        [row.file_id, row.attempts, row.lease_token],
      );
      return row;
    });
    if (!job) return false;
    try {
      const manifest = await this.db.transaction(async (m) => {
        const files: {
          bucket: string;
          staging_key: string;
          object_key: string | null;
          size_bytes: string | null;
        }[] = await m.query('SELECT * FROM file_objects WHERE id=$1 FOR UPDATE', [job.file_id]);
        const file = files[0];
        if (!file) throw new Error('File missing');
        const owned = await m.query(
          "SELECT 1 FROM material_file_cleanup_jobs WHERE file_id=$1 AND lease_token=$2 AND status='RUNNING' AND lease_until>clock_timestamp() FOR UPDATE",
          [job.file_id, job.lease_token],
        );
        if (!owned.length) return null;
        const used = await m.query(
          `SELECT 1 WHERE EXISTS(SELECT 1 FROM materials WHERE file_object_id=$1 AND deleted_at IS NULL)
          OR EXISTS(SELECT 1 FROM material_file_references r JOIN materials m ON m.id=r.material_id WHERE r.file_id=$1 AND m.deleted_at IS NULL)
          OR EXISTS(SELECT 1 FROM file_metadata meta JOIN file_objects parent ON parent.id=meta.file_object_id WHERE meta.preview_file_id=$1 AND parent.status<>'DELETED')
          OR EXISTS(SELECT 1 FROM file_processing_jobs WHERE file_object_id=$1 AND (status='PROCESSING' OR (kind='VALIDATE' AND status='PENDING')))`,
          [job.file_id],
        );
        if (used.length) {
          await m.query(
            "UPDATE material_file_cleanup_jobs SET status='SKIPPED',available_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,error_code='FILE_STILL_REFERENCED' WHERE file_id=$1",
            [job.file_id],
          );
          return null;
        }
        if (job.manifest.length) return job.manifest;
        const copies: { key: string }[] = await m.query(
          "SELECT DISTINCT candidate->>'key' AS key FROM file_processing_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.copy_candidates) candidate WHERE j.file_object_id=$1",
          [job.file_id],
        );
        const keys = [
          ...new Set([
            file.staging_key,
            ...(file.object_key ? [file.object_key] : []),
            ...copies.map((c) => c.key),
          ]),
        ];
        const result: CleanupJob['manifest'] = keys.map((key) => ({ bucket: file.bucket, key }));
        await m.query(
          "UPDATE file_processing_jobs SET status='FAILED',error_code='FILE_DELETED',completed_at=clock_timestamp() WHERE file_object_id=$1 AND status='PENDING'",
          [job.file_id],
        );
        await m.query(
          "UPDATE file_objects SET status='DELETED',deleted_at=clock_timestamp() WHERE id=$1 AND status<>'DELETED'",
          [job.file_id],
        );
        await m.query(
          'UPDATE material_file_cleanup_jobs SET manifest=$2::jsonb,reclaimable_bytes=$3 WHERE file_id=$1',
          [job.file_id, JSON.stringify(result), file.size_bytes ?? '0'],
        );
        return result;
      });
      if (!manifest) return true;
      if (!this.storage.deleteAllVersions) throw new Error('Version deletion unavailable');
      for (const [index, entry] of manifest.entries()) {
        if (entry.done) continue;
        const owned = await this.db.query(
          "UPDATE material_file_cleanup_jobs SET lease_until=clock_timestamp()+interval '5 minutes' WHERE file_id=$1 AND lease_token=$2 AND status='RUNNING' RETURNING file_id",
          [job.file_id, job.lease_token],
        );
        if (!owned.length) return true;
        const bytes = await this.storage.deleteAllVersions(entry.bucket, entry.key);
        await this.db.query(
          `UPDATE material_file_cleanup_jobs SET manifest=jsonb_set(manifest,ARRAY[$3::text,'done'],'true'),reclaimed_bytes=reclaimed_bytes+$4 WHERE file_id=$1 AND lease_token=$2 AND status='RUNNING'`,
          [job.file_id, job.lease_token, index, bytes ?? 0],
        );
      }
      await this.db.query(
        "UPDATE material_file_cleanup_jobs SET status='DONE',completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,error_code=NULL WHERE file_id=$1 AND lease_token=$2",
        [job.file_id, job.lease_token],
      );
    } catch {
      await this.db.query(
        `UPDATE material_file_cleanup_jobs SET status=CASE WHEN attempts>=5 THEN 'FAILED' ELSE 'PENDING' END,available_at=clock_timestamp()+interval '1 minute'*least(attempts,5),lease_token=NULL,lease_until=NULL,error_code='STORAGE_CLEANUP_FAILED' WHERE file_id=$1 AND lease_token=$2`,
        [job.file_id, job.lease_token],
      );
    }
    return true;
  }
}
