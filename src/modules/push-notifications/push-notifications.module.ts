import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FcmAdapter, PUSH_PROVIDER } from './fcm.adapter.js';
import { PushController } from './push.controller.js';
import { PushConfig } from './push-config.service.js';
import { PushCrypto } from './push-crypto.service.js';
import { PushEligibility } from './push-eligibility.service.js';
import { PushMaintenance } from './push-maintenance.service.js';
import { PushOutbox } from './push-outbox.service.js';
import { PushRegistry } from './push-registry.service.js';
import { PushWorker } from './push-worker.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PushController],
  providers: [
    PushMaintenance,
    PushConfig,
    PushCrypto,
    PushEligibility,
    PushOutbox,
    PushRegistry,
    PushWorker,
    { provide: PUSH_PROVIDER, useClass: FcmAdapter },
  ],
  exports: [PushOutbox, PushEligibility],
})
export class PushNotificationsModule {}
