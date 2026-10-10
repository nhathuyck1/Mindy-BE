export const MAX_SCHEDULE_RANGE_DAYS = 31;

const DAY_MS = 86_400_000;

/** ISO 8601 date-time that carries an explicit `Z` or `±HH:MM` offset. */
export const ZONED_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Returns why `[from, to)` is not an acceptable schedule range, or null when it is. */
export function scheduleRangeError(from: Date, to: Date): string | null {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return 'from and to must be valid timestamps';
  }
  if (from.getTime() >= to.getTime()) {
    return 'to must be later than from';
  }
  if (to.getTime() - from.getTime() > MAX_SCHEDULE_RANGE_DAYS * DAY_MS) {
    return `the range must not exceed ${MAX_SCHEDULE_RANGE_DAYS} days`;
  }
  return null;
}
