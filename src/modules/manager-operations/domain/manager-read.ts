import { HttpStatus } from '@nestjs/common';
import { AppHttpException } from '../../../common/http/app-http.exception.js';
export function literalSearch(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}
export function managerRange(
  from: string | undefined,
  to: string | undefined,
  maxDays: number,
): { from: Date; to: Date } | null {
  if (from === undefined && to === undefined) return null;
  const start = new Date(from ?? '');
  const end = new Date(to ?? '');
  if (!(start < end) || end.getTime() - start.getTime() > maxDays * 86400000)
    throw new AppHttpException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'MANAGER_RANGE_INVALID',
      `Supply from and to with a positive interval of at most ${maxDays} days`,
    );
  return { from: start, to: end };
}

const SAFE_REVIEW_REASONS = new Set([
  'INVALID_RESULT_OR_CURRENCY',
  'AMOUNT_OR_METHOD_MISMATCH',
  'LINK_MISMATCH',
  'ORDER_CLOSED_OR_LATE',
  'CLASS_CANCELLED',
  'PAYMENT_ALREADY_REQUIRES_REVIEW',
  'ADDITIONAL_SETTLEMENT',
  'MISSING_OR_RELEASED_HOLD',
  'UNKNOWN_PROVIDER_ORDER',
]);
export function safeReviewReason(reason: string | null): string | null {
  return reason !== null && SAFE_REVIEW_REASONS.has(reason) ? reason : null;
}
