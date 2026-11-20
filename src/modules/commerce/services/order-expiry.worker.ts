import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';

// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { OrderExpiryService } from './order-expiry.service.js';

const BATCH_SIZE = 100;

/**
 * Periodically expires overdue orders. Each run drains the whole backlog, so a restart after
 * downtime catches up by itself. Rows are claimed with SKIP LOCKED, which keeps the job safe
 * when several application replicas run it.
 */
@Injectable()
export class OrderExpiryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OrderExpiryWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private isRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly expiryService: OrderExpiryService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.getOrThrow<boolean>('ORDER_EXPIRY_JOB_ENABLED')) {
      return;
    }

    const intervalMs = this.config.getOrThrow<number>('ORDER_EXPIRY_JOB_INTERVAL_SECONDS') * 1000;
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.timer.unref();
    void this.run();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async run(): Promise<number> {
    if (this.isRunning) {
      return 0;
    }

    this.isRunning = true;
    let expired = 0;
    try {
      let batch = 0;
      do {
        batch = await this.expiryService.expireOverdueBatch(new Date(), BATCH_SIZE);
        expired += batch;
      } while (batch === BATCH_SIZE);
      if (expired > 0) {
        this.logger.log(`Expired ${expired} unpaid order(s) and released their seat holds`);
      }
    } catch (error: unknown) {
      this.logger.error(
        'Order expiry run failed; it will be retried on the next interval',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }

    return expired;
  }
}
