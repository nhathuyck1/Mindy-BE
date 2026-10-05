import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { DataSource } from 'typeorm';
import type { PageOptionsDto } from '../../../common/dtos/page-options.dto.js';
import { PAYOS_PROVIDER, type PayosProvider } from '../domain/payos-provider.js';
import { PaymentTransactionEntity } from '../entities/payment-transaction.entity.js';
import { PaymentWebhookEventEntity } from '../entities/payment-webhook-event.entity.js';
import { PayosPaymentDetailEntity } from '../entities/payos-payment-detail.entity.js';
import { PaymentOrderInvalidException } from '../exceptions/payment.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { PaymentSettlementService } from './payment-settlement.service.js';

@Injectable()
export class PaymentReconciliationService {
  constructor(
    private readonly db: DataSource,
    @Inject(PAYOS_PROVIDER) private readonly provider: PayosProvider,
    private readonly settlement: PaymentSettlementService,
  ) {}

  async list(
    options: PageOptionsDto,
  ): Promise<{ items: PaymentWebhookEventEntity[]; total: number }> {
    const [items, total] = await this.db.getRepository(PaymentWebhookEventEntity).findAndCount({
      where: { outcome: 'REQUIRES_REVIEW' },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    });
    return { items, total };
  }

  /** ADMIN command queries provider; never trusts a browser payment status. */
  async reconcile(paymentId: string, actorId: string): Promise<{ status: string }> {
    const p = await this.db.getRepository(PaymentTransactionEntity).findOneBy({ id: paymentId });
    const d = await this.db.getRepository(PayosPaymentDetailEntity).findOneBy({ paymentId });
    if (!p || !d || d.channelKey !== this.provider.channelKey)
      throw new PaymentOrderInvalidException();
    const link = await this.provider.get(d.providerOrderCode);
    if (!link) return { status: 'NOT_FOUND' };
    if (link.status !== 'PAID') return { status: link.status };
    // Partial/multiple transfers are outside full-payment scope; persist review instead of access.
    const t = link.transactions[0];
    const exact =
      link.amount === p.amount &&
      link.amountPaid === p.amount &&
      link.transactions.length === 1 &&
      t?.amount === p.amount;
    const status = await this.settlement.settle(
      {
        orderCode: link.orderCode,
        amount: link.amountPaid,
        currency: 'VND',
        paymentLinkId: link.id,
        reference: t?.reference ?? `reconcile-${p.id}`,
        code: exact ? '00' : 'REVIEW',
        isConfirmSample: false,
      },
      'RECONCILIATION',
      actorId,
    );
    return { status };
  }
}
