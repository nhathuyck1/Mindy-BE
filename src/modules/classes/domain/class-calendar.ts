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
  return clockOnLocalDate(toLocalDate(instant, timeZone), clockTime, timeZone, instant);
}

/** Resolve a calendar date without adding elapsed hours across a time-zone offset change. */
export function localDateAtTime(date: string, clockTime: string, timeZone: string): Date | null {
  return clockOnLocalDate(date, clockTime, timeZone, new Date(`${date}T12:00:00Z`));
}

function clockOnLocalDate(
  date: string,
  clockTime: string,
  timeZone: string,
  instant: Date,
): Date | null {
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
  const target = Date.parse(`${date}T${clockTime}:00Z`);
  const originalSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  let candidate = new Date(target - (localAsUtc(instant) - originalSeconds));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const delta = target - localAsUtc(candidate);
    if (delta === 0) return candidate;
    candidate = new Date(candidate.getTime() + delta);
  }
  return null;
}

/** Exclusive midnight after the day following the scheduled teaching day. */
export function attendanceDeadline(startsAt: Date, timeZone: string): Date | null {
  const day = new Date(`${toLocalDate(startsAt, timeZone)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 2);
  return localDateAtTime(day.toISOString().slice(0, 10), '00:00', timeZone);
}

export function isSingleTeachingDay(startsAt: Date, endsAt: Date, timeZone: string): boolean {
  return (
    startsAt < endsAt &&
    toLocalDate(startsAt, timeZone) === toLocalDate(new Date(endsAt.getTime() - 1), timeZone)
  );
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
