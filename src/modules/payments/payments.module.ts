import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../../shared/mail/mail.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { CommerceModule } from '../commerce/commerce.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { UsersModule } from '../users/users.module.js';
import { PayosAdapter } from './adapters/payos.adapter.js';
import {
  CashPaymentsController,
  CashPreviewController,
} from './controllers/cash-payments.controller.js';
import { MentorClassRosterController } from './controllers/mentor-class-roster.controller.js';
import {
  PaymentCallbacksController,
  PaymentReconciliationController,
  PaymentsController,
} from './controllers/payments.controller.js';
import { PAYOS_PROVIDER } from './domain/payos-provider.js';
import { PaymentConfirmationEmailEntity } from './entities/payment-confirmation-email.entity.js';
import { PaymentTransactionEntity } from './entities/payment-transaction.entity.js';
import { PaymentWebhookEventEntity } from './entities/payment-webhook-event.entity.js';
import { PayosPaymentDetailEntity } from './entities/payos-payment-detail.entity.js';
import { CashPaymentsService } from './services/cash-payments.service.js';
import { MentorClassRosterService } from './services/mentor-class-roster.service.js';
import { PaymentEmailService } from './services/payment-email.service.js';
import { PaymentEmailWorker } from './services/payment-email.worker.js';
import { PaymentLinksService } from './services/payment-links.service.js';
import { PaymentReconciliationService } from './services/payment-reconciliation.service.js';
import { PaymentSettlementService } from './services/payment-settlement.service.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CommerceModule,
    ClassesModule,
    EnrollmentsModule,
    UsersModule,
    MailModule,
    TypeOrmModule.forFeature([
      PaymentTransactionEntity,
      PayosPaymentDetailEntity,
      PaymentWebhookEventEntity,
      PaymentConfirmationEmailEntity,
    ]),
  ],
  controllers: [
    PaymentsController,
    PaymentCallbacksController,
    PaymentReconciliationController,
    CashPaymentsController,
    CashPreviewController,
    MentorClassRosterController,
  ],
  providers: [
    CashPaymentsService,
    MentorClassRosterService,
    PayosAdapter,
    { provide: PAYOS_PROVIDER, useExisting: PayosAdapter },
    PaymentLinksService,
    PaymentSettlementService,
    PaymentReconciliationService,
    PaymentEmailService,
    PaymentEmailWorker,
  ],
})
export class PaymentsModule {}
