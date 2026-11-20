import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI token.
import { DataSource } from 'typeorm';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatAttachmentsService } from './chat-attachments.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatJobsService } from './chat-jobs.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatLifecycleService } from './chat-lifecycle.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatNotificationsService } from './chat-notifications.service.js';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ChatSocketService } from './chat-socket.service.js';

@Injectable()
export class ChatWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly running = new Map<string, Promise<void>>();
  private stopped = false;
  private maintenanceAt = 0;
  constructor(
    private readonly config: ConfigService,
    private readonly db: DataSource,
    private readonly jobs: ChatJobsService,
    private readonly lifecycle: ChatLifecycleService,
    private readonly notifications: ChatNotificationsService,
    private readonly sockets: ChatSocketService,
    private readonly attachments: ChatAttachmentsService,
  ) {}
  onApplicationBootstrap(): void {
    if (
      !this.config.get<boolean>('CHAT_ENABLED', false) ||
      !this.config.get<boolean>('CHAT_JOB_ENABLED', false)
    )
      return;
    this.timer = setInterval(() => {
      void this.tick().catch(() => {});
    }, 500);
    this.timer.unref();
  }
  async tick(): Promise<void> {
    if (this.stopped) return;
    if (this.attachments.available() && Date.now() >= this.maintenanceAt) {
      this.maintenanceAt = Date.now() + 60000;
      await this.db.query(`UPDATE chat_file_objects SET status='FAILED',error_code='CHAT_UPLOAD_EXPIRED'
        WHERE status='PENDING_UPLOAD' AND intent_expires_at<=clock_timestamp()`);
      await this.db.query(`UPDATE chat_file_objects f SET status='FAILED',error_code='CHAT_UPLOAD_RETRY_EXHAUSTED'
        WHERE status='PROCESSING' AND EXISTS(SELECT 1 FROM chat_jobs j WHERE j.event_id=f.id AND j.consumer='UPLOAD' AND j.status='DEAD')`);
      await this.attachments.enqueueCleanup();
    }
    for (const consumer of ['LIFECYCLE', 'REALTIME', 'NOTIFICATION', 'UPLOAD', 'CLEANUP']) {
      if (this.stopped) return;
      if (['UPLOAD', 'CLEANUP'].includes(consumer) && !this.attachments.available()) continue;
      if (this.running.has(consumer)) continue;
      const work = this.consume(consumer)
        .catch(() => {})
        .finally(() => this.running.delete(consumer));
      this.running.set(consumer, work);
    }
  }
  private async consume(consumer: string): Promise<void> {
    const job = await this.jobs.claim(consumer);
    if (!job) return;
    try {
      if (consumer === 'LIFECYCLE') {
        const rows: { aggregate_id: string }[] = await this.db.query(
          'SELECT aggregate_id FROM domain_outbox WHERE event_id=$1',
          [job.event_id],
        );
        if (rows[0]) await this.lifecycle.reconcileClass(rows[0].aggregate_id);
      } else if (consumer === 'REALTIME') await this.sockets.dispatch(job);
      else if (consumer === 'NOTIFICATION') {
        await this.notifications.fanout(job);
        for (const delivery of await this.notifications.deliveries(job))
          await this.sockets.own(
            delivery.userId,
            'notification:created',
            { notification: delivery.notification },
            delivery.notification.conversationId,
          );
      } else if (consumer === 'UPLOAD') await this.attachments.process(job);
      else await this.attachments.cleanup(job);
      await this.jobs.complete(job);
    } catch {
      await this.jobs.fail(job);
    }
  }
  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    await Promise.all(this.running.values());
  }
}
