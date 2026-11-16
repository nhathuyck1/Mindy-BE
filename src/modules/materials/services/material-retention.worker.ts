import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MaterialFileCleanupService } from '../../files/services/material-file-cleanup.service.js';

@Injectable()
export class MaterialRetentionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private lastTracking = 0;
  private readonly logger = new Logger(MaterialRetentionWorker.name);
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly cleanup: MaterialFileCleanupService,
  ) {}
  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.run(), 15_000);
    this.timer.unref();
    void this.run();
  }
  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      if (
        this.config.getOrThrow<boolean>('MATERIAL_TRACKING_JOB_ENABLED') &&
        Date.now() - this.lastTracking >= 3_600_000
      ) {
        await this.db.query(
          `UPDATE materials SET is_unseen=true WHERE deleted_at IS NULL AND NOT is_unseen AND coalesce(last_seen_at,tracking_started_at)<=clock_timestamp()-interval '30 days'`,
        );
        this.lastTracking = Date.now();
      }
      if (
        this.config.getOrThrow<boolean>('MATERIAL_CLEANUP_JOB_ENABLED') &&
        this.config.getOrThrow<boolean>('MINIO_ENABLED')
      ) {
        // Revisit skipped jobs: a shared reference or processing job may have finished meanwhile.
        await this.db.query(
          `UPDATE material_file_cleanup_jobs SET status='PENDING',attempts=0,available_at=clock_timestamp() WHERE status='SKIPPED' AND available_at<clock_timestamp()-interval '1 hour'`,
        );
        await this.db.query(
          `UPDATE material_file_cleanup_jobs SET status='PENDING',attempts=0,available_at=clock_timestamp(),manifest=(SELECT jsonb_agg(e-'done') FROM jsonb_array_elements(manifest) e) WHERE status='DONE' AND completed_at<clock_timestamp()-interval '1 day'`,
        );
        for (let i = 0; i < 20; i += 1) if (!(await this.cleanup.runOne())) break;
      }
    } catch {
      this.logger.error('Material retention batch failed; next tick will retry');
    } finally {
      this.running = false;
    }
  }
}
