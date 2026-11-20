import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ClassOpeningService } from './class-opening.service.js';

@Injectable()
export class ClassOpeningWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(ClassOpeningWorker.name);
  constructor(
    private readonly config: ConfigService,
    private readonly opening: ClassOpeningService,
  ) {}
  onApplicationBootstrap(): void {
    if (!this.config.getOrThrow<boolean>('CLASS_OPENING_JOB_ENABLED')) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 15_000);
    this.timer.unref();
  }
  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.opening.runBatch();
    } catch {
      this.logger.error('Class opening batch failed; next tick will retry');
    } finally {
      this.running = false;
    }
  }
}
