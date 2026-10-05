import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { ConfigService } from '@nestjs/config';
import { APIError, PayOS, type Webhook } from '@payos/node';
import type { PaymentLink, PayosProvider, VerifiedPayment } from '../domain/payos-provider.js';
import {
  InvalidPaymentWebhookException,
  PaymentUnavailableException,
} from '../exceptions/payment.exceptions.js';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Retains every signed data field, including fields added by the provider. */
export function parseWebhook(value: unknown): Webhook {
  if (
    !object(value) ||
    typeof value.code !== 'string' ||
    typeof value.desc !== 'string' ||
    typeof value.success !== 'boolean' ||
    typeof value.signature !== 'string' ||
    !/^[a-fA-F0-9]{64}$/.test(value.signature) ||
    !object(value.data)
  )
    throw new InvalidPaymentWebhookException();
  const data = value.data;
  if (
    !Number.isSafeInteger(data.orderCode) ||
    (data.orderCode as number) < 0 ||
    !Number.isSafeInteger(data.amount) ||
    (data.amount as number) < 0
  )
    throw new InvalidPaymentWebhookException();
  for (const field of [
    'description',
    'accountNumber',
    'reference',
    'transactionDateTime',
    'currency',
    'paymentLinkId',
    'code',
    'desc',
  ]) {
    if (typeof data[field] !== 'string' || (data[field] as string).length > 500)
      throw new InvalidPaymentWebhookException();
  }
  if (
    (data.reference as string).length === 0 ||
    (data.reference as string).length > 150 ||
    (data.paymentLinkId as string).length > 150 ||
    (data.currency as string).length > 10 ||
    (data.code as string).length > 10
  )
    throw new InvalidPaymentWebhookException();
  return value as unknown as Webhook;
}

@Injectable()
export class PayosAdapter implements PayosProvider {
  readonly channelKey: string;
  private readonly client: PayOS | null;

  constructor(private readonly config: ConfigService) {
    this.channelKey = createHash('sha256')
      .update(config.getOrThrow<string>('PAYOS_CLIENT_ID'))
      .digest('hex');
    this.client = config.getOrThrow<boolean>('PAYOS_ENABLED')
      ? new PayOS({
          clientId: config.getOrThrow<string>('PAYOS_CLIENT_ID'),
          apiKey: config.getOrThrow<string>('PAYOS_API_KEY'),
          checksumKey: config.getOrThrow<string>('PAYOS_CHECKSUM_KEY'),
          // Do not inherit SDK debug/baseURL environment defaults.
          baseURL: 'https://api-merchant.payos.vn',
          logLevel: 'off',
          logger: null,
          timeout: 10_000,
          maxRetries: 0,
        })
      : null;
  }

  private enabled(): PayOS {
    if (!this.client) throw new PaymentUnavailableException();
    return this.client;
  }

  async create(orderCode: number, amount: number, expiresAt: Date): Promise<PaymentLink> {
    try {
      const link = await this.enabled().paymentRequests.create({
        orderCode,
        amount,
        description: `MD${orderCode.toString(36).toUpperCase()}`.slice(0, 9),
        expiredAt: Math.floor(expiresAt.getTime() / 1000),
        returnUrl: this.config.getOrThrow<string>('PAYOS_RETURN_URL'),
        cancelUrl: this.config.getOrThrow<string>('PAYOS_CANCEL_URL'),
      });
      if (link.currency !== 'VND') throw new PaymentUnavailableException();
      return {
        id: link.paymentLinkId,
        orderCode: link.orderCode,
        amount: link.amount,
        amountPaid: 0,
        status: link.status,
        checkoutUrl: link.checkoutUrl,
        qrCode: link.qrCode,
        transactions: [],
      };
    } catch {
      throw new PaymentUnavailableException();
    }
  }

  async get(orderCode: number): Promise<PaymentLink | null> {
    try {
      const link = await this.enabled().paymentRequests.get(orderCode);
      if (!/^[a-zA-Z0-9-]{1,150}$/.test(link.id)) throw new PaymentUnavailableException();
      return {
        ...link,
        checkoutUrl: `https://pay.payos.vn/web/${link.id}`,
        qrCode: null,
        transactions: link.transactions.map((t) => ({ reference: t.reference, amount: t.amount })),
      };
    } catch (error: unknown) {
      // payOS 231 = payment link not found. Other failures are ambiguous: never create blindly.
      if (error instanceof APIError && error.code === '231') return null;
      throw new PaymentUnavailableException();
    }
  }

  async verify(body: unknown): Promise<VerifiedPayment> {
    const client = this.enabled();
    const webhook = parseWebhook(body);
    try {
      const d = await client.webhooks.verify(webhook);
      // Full official confirm fixture, after verification; orderCode alone is never a bypass.
      const isConfirmSample =
        d.orderCode === 123 &&
        d.amount === 3000 &&
        d.reference === 'TF230204212323' &&
        d.paymentLinkId === '124c33293c43417ab7879e14c8d9eb18' &&
        d.transactionDateTime === '2023-02-04 18:25:00' &&
        d.accountNumber === '12345678' &&
        d.currency === 'VND' &&
        d.code === '00';
      return {
        orderCode: d.orderCode,
        amount: d.amount,
        currency: d.currency,
        paymentLinkId: d.paymentLinkId,
        reference: d.reference,
        code: d.code,
        isConfirmSample,
      };
    } catch {
      throw new InvalidPaymentWebhookException();
    }
  }
}
