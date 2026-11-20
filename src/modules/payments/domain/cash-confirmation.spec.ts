import { describe, expect, it } from 'vitest';
import { isCashConfirmation } from './cash-confirmation.js';

const ORDER = '23418e6c-9f61-43cb-9a70-ef8b30ff62d0';
const MANAGER = 'e0eab1ec-a30c-4291-8188-ed1ccaa46971';
const MENTOR = '5600812d-5e45-4f3c-b970-528ea3428117';

describe('cash settlement provenance', () => {
  it('accepts a manager collector independently of the checkout mentor', () => {
    expect(isCashConfirmation(`cash-manager:${MANAGER}:${ORDER}`, ORDER, MENTOR)).toBe(true);
    expect(isCashConfirmation(`cash-manager:${MANAGER}:${ORDER}`, ORDER, null)).toBe(true);
  });

  it('preserves historical confirmations only for the recorded mentor', () => {
    expect(isCashConfirmation(`cash:${MENTOR}:${ORDER}`, ORDER, MENTOR)).toBe(true);
    expect(isCashConfirmation(`cash:${MANAGER}:${ORDER}`, ORDER, MENTOR)).toBe(false);
  });

  it.each([
    null,
    `cash-manager:${MANAGER}:${MENTOR}`,
    `cash-manager:invalid:${ORDER}`,
    `cash-manager:${MANAGER}:${ORDER}:extra`,
    `cash-manager:${MANAGER}:${ORDER}:`,
    `payos:${MANAGER}:${ORDER}`,
  ])('rejects mismatched or malformed references: %s', (reference) => {
    expect(isCashConfirmation(reference, ORDER, MENTOR)).toBe(false);
  });
});
