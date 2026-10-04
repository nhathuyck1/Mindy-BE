import { describe, expect, it } from 'vitest';

import { ClassStatus } from '../../classes/enums/class-status.enum.js';
import { DeliveryMode } from '../../classes/enums/delivery-mode.enum.js';
import type { ClassOffer } from '../../classes/services/class-offers.service.js';
import { PaymentType } from '../enums/payment-type.enum.js';
import { calculateExpiry, generateOrderCode, planOrders } from './checkout-plan.js';

const MENTOR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MENTOR_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function offer(classId: string, mentorId: string, priceAmount: number): ClassOffer {
  return {
    classId,
    code: `CODE-${classId}`,
    name: `Class ${classId}`,
    status: ClassStatus.OPEN,
    deliveryMode: DeliveryMode.OFFLINE,
    startDate: '2026-11-02',
    endDate: '2026-11-30',
    mentorId,
    maxStudents: 10,
    courseId: 'course',
    courseTitle: 'Course',
    priceAmount,
    isPurchasable: true,
  };
}

describe('planOrders', () => {
  const offers = [
    offer('c3', MENTOR_A, 300_000),
    offer('c1', MENTOR_B, 100_000),
    offer('c2', MENTOR_A, 200_000),
  ];

  it('creates one PayOS order for the whole cart with a server-side total', () => {
    const plans = planOrders(PaymentType.PAYOS, offers);

    expect(plans).toHaveLength(1);
    expect(plans[0]?.cashMentorId).toBeNull();
    expect(plans[0]?.totalAmount).toBe(600_000);
    expect(plans[0]?.offers.map((item) => item.classId)).toEqual(['c1', 'c2', 'c3']);
  });

  it('splits a cash checkout into one order per mentor', () => {
    const plans = planOrders(PaymentType.CASH, offers);

    expect(plans.map((plan) => plan.cashMentorId)).toEqual([MENTOR_A, MENTOR_B]);
    expect(plans.map((plan) => plan.totalAmount)).toEqual([500_000, 100_000]);
    expect(plans[0]?.offers.map((item) => item.classId)).toEqual(['c2', 'c3']);
  });

  it('plans nothing for an empty cart and accepts free classes', () => {
    expect(planOrders(PaymentType.CASH, [])).toEqual([]);
    expect(planOrders(PaymentType.PAYOS, [offer('c1', MENTOR_A, 0)])[0]?.totalAmount).toBe(0);
  });

  it('refuses a total outside the safe integer range', () => {
    const huge = Number.MAX_SAFE_INTEGER;

    expect(() =>
      planOrders(PaymentType.PAYOS, [offer('c1', MENTOR_A, huge), offer('c2', MENTOR_A, huge)]),
    ).toThrow(RangeError);
  });
});

describe('order helpers', () => {
  it('adds the hold TTL to the checkout time', () => {
    const now = new Date('2026-10-02T10:00:00Z');

    expect(calculateExpiry(now, 900).toISOString()).toBe('2026-10-02T10:15:00.000Z');
    expect(calculateExpiry(now, 172_800).toISOString()).toBe('2026-10-04T10:00:00.000Z');
  });

  it('generates distinct codes that are safe to type into a bank transfer', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateOrderCode()));

    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^MD[0-9A-HJKMNP-TV-Z]{12}$/);
    }
  });
});
