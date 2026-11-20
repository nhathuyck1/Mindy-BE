import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { QuizAttemptsService } from './quiz-attempts.service.js';

@Injectable()
export class QuizTimeoutWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(QuizTimeoutWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running: Promise<void> | null = null;
  constructor(
    private readonly config: ConfigService,
    private readonly attempts: QuizAttemptsService,
  ) {}
  onApplicationBootstrap(): void {
    if (!this.config.getOrThrow<boolean>('ASSIGNMENT_TIMEOUT_JOB_ENABLED')) return;
    this.timer = setInterval(() => this.tick(), 2000);
    this.timer.unref();
    this.tick();
  }
  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  private tick(): void {
    if (this.running) return;
    this.running = this.attempts
      .finalizeDue()
      .then(() => {})
      .catch(() => {
        this.logger.error('Assignment timeout poll failed; durable jobs will be retried');
      })
      .finally(() => {
        this.running = null;
      });
  }
}
