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
