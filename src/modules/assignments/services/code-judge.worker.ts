import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { CodeJudgeService } from './code-judge.service.js';

/**
 * Polls the durable code_judge_jobs queue (SKIP LOCKED + lease). Concurrency should equal the runner's
 * batch slots. Idles while CODE_RUNNER_URL is empty so queued submissions wait instead of failing.
 */
@Injectable()
export class CodeJudgeWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CodeJudgeWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private readonly active = new Set<Promise<void>>();
  private filling = false;
  private stopping = false;

  constructor(
    private readonly config: ConfigService,
    private readonly judge: CodeJudgeService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.getOrThrow<boolean>('CODE_JUDGE_JOB_ENABLED')) return;
    if (!this.config.getOrThrow<string>('CODE_RUNNER_URL')) {
      this.logger.warn(
        'CODE_RUNNER_URL is empty: code submissions stay queued until a runner is configured',
      );
      return;
    }
    this.timer = setInterval(() => void this.fill(), 1000);
    this.timer.unref();
    void this.fill();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    // Unfinished jobs keep their lease and are retried after it expires.
    await Promise.allSettled([...this.active]);
  }

  private async fill(): Promise<void> {
    if (this.filling || this.stopping) return;
    this.filling = true;
    try {
      const limit = this.config.getOrThrow<number>('CODE_JUDGE_CONCURRENCY');
      while (!this.stopping && this.active.size < limit) {
        const claim = await this.judge.claim();
        if (!claim) break;
        const task = this.judge
          .process(claim)
          .catch((error: unknown) => {
            // Unexpected bug or DB failure: the lease expires and the job is retried.
            this.logger.error(`Code judge job ${claim.submissionId} crashed: ${String(error)}`);
          })
          .finally(() => {
            this.active.delete(task);
          });
        this.active.add(task);
      }
    } catch {
      this.logger.error('Code judge poll failed; durable jobs will be retried');
    } finally {
      this.filling = false;
    }
  }
}
