import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { PaymentEmailService } from './payment-email.service.js';

@Injectable()
export class PaymentEmailWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentEmailWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  constructor(
    private readonly config: ConfigService,
    private readonly emails: PaymentEmailService,
  ) {}
  onApplicationBootstrap(): void {
    if (
      !this.config.getOrThrow<boolean>('PAYMENT_MAIL_JOB_ENABLED') ||
      !this.config.getOrThrow<boolean>('MAIL_ENABLED')
    )
      return;
    this.timer = setInterval(
      () => void this.run(),
      this.config.getOrThrow<number>('PAYMENT_MAIL_JOB_INTERVAL_SECONDS') * 1000,
    );
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
      for (let i = 0; i < 20 && (await this.emails.sendBatch()); i++) {
        /* Bound each run. */
      }
    } catch {
      this.logger.error('Payment email job failed; will retry without logging payload');
    } finally {
      this.running = false;
    }
  }
}
