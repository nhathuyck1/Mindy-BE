/**
 * Class start/end dates are calendar dates of the center, while sessions are instants.
 * Returns the `YYYY-MM-DD` calendar date of an instant in the center's time zone, which
 * compares lexicographically with `date` columns.
 */
export function toLocalDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Changes the clock time while retaining the instant's local calendar date. Keeps the
 * original offset when possible on a repeated DST hour; nonexistent local times return null.
 */
export function withLocalTime(instant: Date, clockTime: string, timeZone: string): Date | null {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const localAsUtc = (date: Date): number => {
    const parts = formatter.formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((candidate) => candidate.type === type)?.value ?? '';
    return Date.parse(
      `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`,
    );
  };
  const target = Date.parse(`${toLocalDate(instant, timeZone)}T${clockTime}:00Z`);
  const originalSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  let candidate = new Date(target - (localAsUtc(instant) - originalSeconds));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const delta = target - localAsUtc(candidate);
    if (delta === 0) return candidate;
    candidate = new Date(candidate.getTime() + delta);
  }
  return null;
}

export function isWithinClassPeriod(
  session: { readonly startsAt: Date; readonly endsAt: Date },
  period: { readonly startDate: string; readonly endDate: string },
  timeZone: string,
): boolean {
  return (
    toLocalDate(session.startsAt, timeZone) >= period.startDate &&
    toLocalDate(session.endsAt, timeZone) <= period.endDate
  );
}
