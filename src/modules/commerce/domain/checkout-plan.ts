import { randomInt } from 'node:crypto';

import type { ClassOffer } from '../../classes/services/class-offers.service.js';
import { PaymentType } from '../enums/payment-type.enum.js';

/** A cart is capped so one checkout locks a bounded number of class rows. */
export const CART_MAX_ITEMS = 20;

const ORDER_CODE_PREFIX = 'MD';
const ORDER_CODE_RANDOM_LENGTH = 12;
// Crockford base32 without look-alike characters; the code is typed into bank transfers.
const ORDER_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface PlannedOrder {
  /** Mentor who must confirm the cash; null for PayOS. */
  readonly cashMentorId: string | null;
  readonly totalAmount: number;
  readonly offers: readonly ClassOffer[];
}

/**
 * Splits a cart into orders. PayOS pays the whole cart with one order. Cash is handed to a
 * mentor, so cash checkout creates one order per mentor. Output order is deterministic.
 */
export function planOrders(
  paymentType: PaymentType,
  offers: readonly ClassOffer[],
): PlannedOrder[] {
  const sorted = [...offers].sort((left, right) => left.classId.localeCompare(right.classId));
  if (sorted.length === 0) {
    return [];
  }
  if (paymentType === PaymentType.PAYOS) {
    return [toPlannedOrder(null, sorted)];
  }

  const offersByMentor = new Map<string, ClassOffer[]>();
  for (const offer of sorted) {
    const group = offersByMentor.get(offer.mentorId) ?? [];
    group.push(offer);
    offersByMentor.set(offer.mentorId, group);
  }

  return [...offersByMentor.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([mentorId, group]) => toPlannedOrder(mentorId, group));
}

function toPlannedOrder(cashMentorId: string | null, offers: readonly ClassOffer[]): PlannedOrder {
  const totalAmount = offers.reduce((total, offer) => total + offer.priceAmount, 0);
  if (!Number.isSafeInteger(totalAmount) || totalAmount < 0) {
    throw new RangeError('Order total is outside the supported integer VND range');
  }

  return { cashMentorId, totalAmount, offers };
}

export function calculateExpiry(now: Date, ttlSeconds: number): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}

/** Unguessable business code; the unique constraint on `order_code` is the final defense. */
export function generateOrderCode(): string {
  let code = ORDER_CODE_PREFIX;
  for (let index = 0; index < ORDER_CODE_RANDOM_LENGTH; index += 1) {
    code += ORDER_CODE_ALPHABET[randomInt(ORDER_CODE_ALPHABET.length)];
  }

  return code;
}
