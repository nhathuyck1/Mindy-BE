import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatAttachmentsService } from './chat-attachments.service.js';
import { type ChatJob, ChatJobsService } from './chat-jobs.service.js';
import { ChatLifecycleService } from './chat-lifecycle.service.js';
import { ChatNotificationsService } from './chat-notifications.service.js';
import { ChatSocketService } from './chat-socket.service.js';
import { ChatWorkerService } from './chat-worker.service.js';

describe('Chat worker consumer isolation', () => {
  afterEach(() => vi.useRealTimers());
  it('continues realtime delivery while an upload is waiting on storage', async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined,
      realtime = 0,
      uploads = 0;
    const upload = new Promise<void>((resolve) => {
      release = resolve;
    });
    const dispatch = vi.fn(async () => {}),
      process = vi.fn(() => upload);
    const job = (): ChatJob => ({
      id: randomUUID(),
      event_id: randomUUID(),
      conversation_id: randomUUID(),
      recipient_ids: [],
      checkpoint: 0,
      lease_token: randomUUID(),
      attempts: 1,
    });
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService({ CHAT_ENABLED: true, CHAT_JOB_ENABLED: true }),
        },
        { provide: DataSource, useValue: { query: vi.fn(async () => []) } },
        {
          provide: ChatJobsService,
          useValue: {
            claim: vi.fn(async (consumer: string) => {
              if (consumer === 'REALTIME' && realtime++ < 2) return job();
              if (consumer === 'UPLOAD' && uploads++ === 0) return job();
              return null;
            }),
            complete: vi.fn(async () => true),
            fail: vi.fn(async () => {}),
          },
        },
        { provide: ChatLifecycleService, useValue: { reconcileClass: vi.fn(async () => {}) } },
        {
          provide: ChatNotificationsService,
          useValue: { fanout: vi.fn(async () => {}), deliveries: vi.fn(async () => []) },
        },
        { provide: ChatSocketService, useValue: { dispatch, own: vi.fn(async () => {}) } },
        {
          provide: ChatAttachmentsService,
          useValue: {
            available: () => true,
            enqueueCleanup: vi.fn(async () => {}),
            process,
            cleanup: vi.fn(async () => {}),
          },
        },
        {
          provide: ChatWorkerService,
          inject: [
            ConfigService,
            DataSource,
            ChatJobsService,
            ChatLifecycleService,
            ChatNotificationsService,
            ChatSocketService,
            ChatAttachmentsService,
          ],
          useFactory: (
            config: ConfigService,
            db: DataSource,
            jobs: ChatJobsService,
            lifecycle: ChatLifecycleService,
            notifications: ChatNotificationsService,
            sockets: ChatSocketService,
            attachments: ChatAttachmentsService,
          ) =>
            new ChatWorkerService(config, db, jobs, lifecycle, notifications, sockets, attachments),
        },
      ],
    }).compile();
    try {
      module.get(ChatWorkerService).onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(500);
      expect(process).toHaveBeenCalledOnce();
      expect(dispatch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(process).toHaveBeenCalledOnce();
    } finally {
      release?.();
      await module.close();
    }
  });
});
