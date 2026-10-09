import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor.
import { FileProcessingService } from './file-processing.service.js';
@Injectable()
export class FileProcessingWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FileProcessingWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | null = null;
  private stopping = false;
  constructor(
    private readonly config: ConfigService,
    private readonly processing: FileProcessingService,
  ) {}
  onApplicationBootstrap(): void {
    if (
      !this.config.getOrThrow<boolean>('MINIO_ENABLED') ||
      !this.config.getOrThrow<boolean>('FILE_JOB_ENABLED')
    )
      return;
    this.timer = setInterval(
      () => void this.run(),
      this.config.getOrThrow<number>('FILE_JOB_POLL_SECONDS') * 1000,
    );
    this.timer.unref();
    void this.run();
  }
  async run(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = this.batch();
    try {
      await this.running;
    } catch {
      this.logger.error('File worker failed; durable leases will recover');
    } finally {
      this.running = null;
    }
  }
  private async batch(): Promise<void> {
    await this.processing.expireIntents();
    await Promise.all(
      Array.from({ length: this.config.getOrThrow<number>('FILE_JOB_CONCURRENCY') }, async () => {
        for (let i = 0; i < 10 && !this.stopping; i++) {
          const claim = await this.processing.claim();
          if (!claim) break;
          await this.processing.process(claim);
        }
      }),
    );
  }
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.processing.stop();
    if (this.timer) clearInterval(this.timer);
    if (this.running) await this.running;
  }
}
