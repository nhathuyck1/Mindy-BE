import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentFilesService } from './assignment-files.service.js';

@Injectable()
export class AssignmentFilesWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  private running: Promise<void> | null = null;
  private readonly logger = new Logger(AssignmentFilesWorker.name);
  constructor(
    private readonly config: ConfigService,
    private readonly files: AssignmentFilesService,
  ) {}
  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>('ASSIGNMENT_FILE_JOB_ENABLED', true)) return;
    this.timer = setInterval(() => this.tick(), 3000);
    this.timer.unref();
    this.tick();
  }
  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.files.onApplicationShutdown();
    await this.running;
  }
  private tick(): void {
    if (this.running) return;
    this.running = this.run()
      .catch(() => {
        this.logger.error('Assignment file jobs pending; retry on next poll');
      })
      .finally(() => {
        this.running = null;
      });
  }
  private async run(): Promise<void> {
    await this.files.maintenance();
    for (let i = 0; i < 5; i++) {
      const job = await this.files.claim();
      if (!job) break;
      await this.files.process(job);
    }
  }
}
