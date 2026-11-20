export const PAYOS_PROVIDER = Symbol('PAYOS_PROVIDER');

export interface PaymentLink {
  readonly orderCode: number;
  readonly id: string;
  readonly amount: number;
  readonly amountPaid: number;
  readonly status: string;
  readonly checkoutUrl: string;
  readonly qrCode: string | null;
  readonly transactions: readonly { reference: string; amount: number }[];
}
export interface VerifiedPayment {
  readonly orderCode: number;
  readonly amount: number;
  readonly currency: string;
  readonly paymentLinkId: string;
  readonly reference: string;
  readonly code: string;
  readonly isConfirmSample: boolean;
}
export interface PayosProvider {
  readonly channelKey: string;
  create(orderCode: number, amount: number, expiresAt: Date): Promise<PaymentLink>;
  get(orderCode: number): Promise<PaymentLink | null>;
  verify(body: unknown): Promise<VerifiedPayment>;
}
